import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { compress } from "hono/compress"
import { csrf } from "hono/csrf"
import { secureHeaders } from "hono/secure-headers"
import type { HttpBindings } from "@hono/node-server"
import {
  audit,
  getOwnerId,
  isInstanceOwner,
  migrateAdminTables,
  recentAudit,
} from "./admin.ts"
import { migrateCryptoAtRest } from "./crypto.ts"
import { auth, migrateAuthTables, registrationOpen } from "./auth/index.ts"
import { CLIENT_IP_HEADER } from "./auth/hooks.ts"
import { migrateAppTables, setSetting } from "./db.ts"
import { personaOf, userIdOf } from "./demo/personas.ts"
import { ensureDemoData, reseedDemoData } from "./demo/seed.ts"
import { DATA_DIR, env } from "./env.ts"
import { banks, STATEMENT_UPLOAD_PATH } from "./routes/banks.ts"
import { finance } from "./routes/finance/index.ts"
import { invoices } from "./routes/invoices/index.ts"
import { publicInvoices } from "./routes/invoices/public.ts"
import { handlePaypalWebhook } from "./banks/paypal/webhooks.ts"
import { sharing } from "./routes/sharing.ts"
import { work } from "./routes/work.ts"
import { inTimeZone } from "./today.ts"
import {
  BACKUP_DIR,
  hasTask,
  listBackups,
  listTasks,
  runTask,
  startScheduler,
} from "./tasks.ts"
import { getUpdateInfo } from "./updates.ts"
import { boundedString, id, validate } from "./validation.ts"
import { z } from "zod"

await migrateAuthTables()
migrateAppTables()
await migrateCryptoAtRest()
migrateAdminTables()
removeOldDebugDumps()

type Vars = {
  Bindings: HttpBindings
  Variables: { user: typeof auth.$Infer.Session.user }
}
const app = new Hono<Vars>()

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      // The invoice PDF renderer is WebAssembly.
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      // Tailwind/Base UI set inline style attributes; charts use inline SVG styles.
      styleSrc: ["'self'", "'unsafe-inline'"],
      // Currency flags in the pickers.
      imgSrc: ["'self'", "data:", "blob:", "https://flagcdn.com"],
      // The PDF preview is a blob: document in a frame.
      frameSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
    },
    referrerPolicy: "same-origin",
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
      usb: [],
    },
  })
)
const gzip = compress({
  encoding: "gzip",
  threshold: 1024,
})
app.use("/api/*", gzip)
/** Hashed bundles can cache forever; HTML must stay fresh for new deploys. */
app.use("/assets/*", async (c, next) => {
  await next()
  if (c.res.status === 200)
    c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable")
})
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/api/")) return next()
  await gzip(c, next)
  if (
    c.res.status === 200 &&
    !c.req.path.startsWith("/assets/") &&
    (c.req.path === "/" || !c.req.path.includes("."))
  ) {
    c.res.headers.set("Cache-Control", "no-cache")
  }
})
// Every API body is small JSON; refuse anything large before it's parsed. Statement uploads set their own limit.
const smallBody = bodyLimit({
  maxSize: 64 * 1024,
  onError: (c) => c.json({ error: "Request too large" }, 413),
})
app.use("/api/*", (c, next) =>
  c.req.path === STATEMENT_UPLOAD_PATH ? next() : smallBody(c, next)
)
// Rejects cross-site form posts (JSON requests are already blocked by CORS preflight).
app.use("/api/*", csrf({ origin: env.appUrl }))

let xffWithoutTrustWarned = false

/**
 * Who's calling, for rate limits and the Devices list. With TRUST_PROXY set, the client address is
 * taken from X-Forwarded-For using the configured hop count; otherwise the socket address. A
 * client-sent copy of the header is always replaced, so it can't be used to dodge the sign-in limits.
 */
app.use("/api/*", async (c, next) => {
  const xff = c.req.header("x-forwarded-for")
  if (xff && env.trustProxyHops === 0 && !xffWithoutTrustWarned) {
    xffWithoutTrustWarned = true
    console.warn(
      "[security] X-Forwarded-For is present but TRUST_PROXY is unset; rate limits use the proxy address, not the visitor. Set TRUST_PROXY to the number of trusted hops."
    )
  }
  let ip = c.env?.incoming?.socket?.remoteAddress || ""
  if (env.trustProxyHops > 0 && xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    const idx = Math.max(0, parts.length - env.trustProxyHops)
    ip = parts[idx] ?? parts[0] ?? ip
  }
  c.req.raw.headers.set(CLIENT_IP_HEADER, ip.replace(/^::ffff:/, ""))
  await next()
})

/** Signed in on a temporary password: only the change-password screen works until it's replaced. */
const mustChangePassword = (user: object) =>
  (user as { mustChangePassword?: boolean }).mustChangePassword === true
const PASSWORD_CHANGE_REQUIRED = {
  error: "Choose a new password to continue.",
  code: "PASSWORD_CHANGE_REQUIRED",
}

app.get("/api/config", (c) => c.json({ registrationOpen: registrationOpen() }))

// Single-user by default: once an account exists, sign-up is closed (see ALLOW_REGISTRATION).
app.post("/api/auth/sign-up/*", async (c, next) => {
  if (!registrationOpen())
    return c.json({ message: "Registration is closed." }, 403)
  await next()
})
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

app.use("/api/banks/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: "Unauthorized" }, 401)
  if (mustChangePassword(session.user))
    return c.json(PASSWORD_CHANGE_REQUIRED, 403)
  c.header("Cache-Control", "no-store")
  // Demo mode: show the made-up demo user's data instead of the caller's, read-only.
  const demo = c.req.header("x-ledger-demo")
  if (demo) {
    if (c.req.method !== "GET")
      return c.json(
        { error: "Demo mode is read-only. Exit demo mode to make changes." },
        403
      )
    // "1" is the original switch; anything else names a persona (unknown ones fall back to the default).
    const persona = personaOf(demo)
    ensureDemoData(persona.id)
    c.set("user", { ...session.user, id: userIdOf(persona) })
  } else {
    c.set("user", session.user)
  }
  // "Today" in the caller's time zone, for due dates and deadlines.
  await inTimeZone(c.req.header("x-timezone"), next)
})
app.route("/api/banks", banks)
app.route("/api/banks", finance)
app.route("/api/banks", work)
app.route("/api/banks", invoices)
app.route("/api/banks", sharing)

// Share links: anyone with the link can see that one invoice (and pay it), no sign-in.
app.route("/api/public", publicInvoices)

// PayPal's instant updates. Each delivery is checked with PayPal before anything is done with it.
app.post(
  "/api/webhooks/paypal/:connectionId",
  validate("param", z.object({ connectionId: id })),
  async (c) => {
    const { connectionId } = c.req.valid("param")
    const result = await handlePaypalWebhook(
      connectionId,
      c.req.raw.headers,
      await c.req.text()
    )
    if (result.status !== 200)
      console.warn(`PayPal webhook rejected: ${result.message}`)
    return c.json({ message: result.message }, result.status)
  }
)

// Instance settings for admins. User management itself goes through Better Auth's /api/auth/admin/*.
app.use("/api/admin/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: "Unauthorized" }, 401)
  if (session.user.role !== "admin")
    return c.json({ error: "Admins only" }, 403)
  if (mustChangePassword(session.user))
    return c.json(PASSWORD_CHANGE_REQUIRED, 403)
  c.header("Cache-Control", "no-store")
  c.set("user", session.user)
  await next()
})
const adminSettings = () => ({
  registrationOpen: registrationOpen(),
  ownerId: getOwnerId(),
})
app.get("/api/admin/update", async (c) => c.json(await getUpdateInfo()))
app.get("/api/admin/settings", (c) => c.json(adminSettings()))
const adminSettingsBody = z.object({ registrationOpen: z.boolean() })
const backupNoteBody = z.object({ note: boundedString(200).optional() })
const taskParam = z.object({
  id: z.enum(["bank-refresh", "fx-rates", "backup", "tidy-up"]),
})
const backupNameParam = z.object({ name: boundedString(120) })
const auditQuery = z.object({
  kind: z.enum(["admin", "auth"]).optional(),
})

app.put(
  "/api/admin/settings",
  validate("json", adminSettingsBody),
  async (c) => {
    const body = c.req.valid("json")
    if (body.registrationOpen !== registrationOpen()) {
      setSetting("registration_open", String(body.registrationOpen))
      const user = c.var.user
      audit({
        kind: "admin",
        ip: c.req.header(CLIENT_IP_HEADER),
        actorId: user.id,
        actorEmail: user.email,
        action: body.registrationOpen ? "Opened sign-ups" : "Closed sign-ups",
      })
    }
    return c.json(adminSettings())
  }
)
app.post("/api/admin/demo/reseed", (c) => {
  reseedDemoData()
  const user = c.var.user
  audit({
    kind: "admin",
    ip: c.req.header(CLIENT_IP_HEADER),
    actorId: user.id,
    actorEmail: user.email,
    action: "Reseeded demo data",
  })
  return c.json({ ok: true })
})
app.get("/api/admin/tasks", (c) => c.json({ tasks: listTasks() }))
app.post("/api/admin/tasks/:id/run", validate("param", taskParam), (c) => {
  const { id: taskId } = c.req.valid("param")
  if (taskId === "backup" && !isInstanceOwner(c.var.user.id))
    return c.json({ error: "Only the instance owner can run backups." }, 403)
  if (!hasTask(taskId)) return c.json({ error: "Not found" }, 404)
  if (listTasks().find((t) => t.id === taskId)?.running)
    return c.json({ error: "That task is already running." }, 409)
  const user = c.var.user
  const label = listTasks().find((t) => t.id === taskId)?.label ?? taskId
  audit({
    kind: "admin",
    ip: c.req.header(CLIENT_IP_HEADER),
    actorId: user.id,
    actorEmail: user.email,
    action: "Ran task",
    detail: label,
  })
  // It can take minutes (a browser per bank); the page polls for the result.
  void runTask(taskId, "manual", { by: user.name || user.email })
  return c.json({ tasks: listTasks() }, 202)
})
app.get("/api/admin/backups", (c) => {
  if (!isInstanceOwner(c.var.user.id))
    return c.json({ error: "Only the instance owner can view backups." }, 403)
  return c.json({ backups: listBackups() })
})
/** Back up now, with an optional note on why. Quick (one VACUUM INTO), so it waits for the copy. */
app.post("/api/admin/backups", validate("json", backupNoteBody), async (c) => {
  if (!isInstanceOwner(c.var.user.id))
    return c.json({ error: "Only the instance owner can create backups." }, 403)
  const note = c.req.valid("json").note?.trim().slice(0, 200) ?? ""
  const user = c.var.user
  const run = await runTask("backup", "manual", {
    by: user.name || user.email,
    note,
  })
  if (!run) return c.json({ error: "A backup is already being made." }, 409)
  if (run.status === "error")
    return c.json({ error: run.summary ?? "The backup failed." }, 500)
  audit({
    kind: "admin",
    ip: c.req.header(CLIENT_IP_HEADER),
    actorId: user.id,
    actorEmail: user.email,
    action: "Backed up database",
    detail: note || undefined,
  })
  return c.json({ backups: listBackups(), summary: run.summary })
})
app.get("/api/admin/backups/:name", validate("param", backupNameParam), (c) => {
  if (!isInstanceOwner(c.var.user.id))
    return c.json(
      { error: "Only the instance owner can download backups." },
      403
    )
  const { name } = c.req.valid("param")
  // Only names the backup task writes, so the path can't leave the backups folder.
  if (!listBackups().some((b) => b.name === name))
    return c.json({ error: "Not found" }, 404)
  const user = c.var.user
  audit({
    kind: "admin",
    ip: c.req.header(CLIENT_IP_HEADER),
    actorId: user.id,
    actorEmail: user.email,
    action: "Downloaded backup",
    detail: name,
  })
  const bytes = readFileSync(path.join(BACKUP_DIR, name))
  return c.body(bytes, 200, {
    "Content-Type": "application/vnd.sqlite3",
    "Content-Disposition": `attachment; filename="${name}"`,
  })
})
app.get("/api/admin/audit", validate("query", auditQuery), (c) => {
  const { kind } = c.req.valid("query")
  return c.json({
    entries: recentAudit({ kind, limit: 200 }),
  })
})
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404))

// In production, serve the built SPA from the same origin.
const dist = path.resolve("dist")
if (existsSync(dist)) {
  app.use("/*", serveStatic({ root: "./dist" }))
  app.get("*", serveStatic({ path: "./dist/index.html" }))
}

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: "Something went wrong." }, 500)
})

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
  // Session cookies are only marked Secure when APP_URL is https.
  const { hostname, protocol } = new URL(env.appUrl)
  if (
    protocol !== "https:" &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1"
  ) {
    console.warn(
      `[security] APP_URL (${env.appUrl}) is not https: sign-in cookies and passwords travel unencrypted.`
    )
  }
  startScheduler()
})

/** Older builds saved screenshots of bank pages to data/debug; they're no longer needed. */
function removeOldDebugDumps() {
  rmSync(path.join(DATA_DIR, "debug"), { recursive: true, force: true })
}
