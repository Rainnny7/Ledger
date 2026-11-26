import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { Elysia } from "elysia"
import { z } from "zod"
import {
	audit,
	getOwnerId,
	isInstanceOwner,
	recentAudit,
} from "./admin/store.ts"
import { auth, registrationOpen } from "./auth/index.ts"
import { CLIENT_IP_HEADER } from "./auth/hooks.ts"
import { handlePaypalWebhook } from "./banks/paypal/webhooks.ts"
import { STATEMENT_MAX_REQUEST_BYTES } from "./banks/upload-gate.ts"
import { runMigrations, setSetting } from "./db/connection.ts"
import { reseedDemoData } from "./demo/seed.ts"
import { env } from "./config/env.ts"
import { apiGuards } from "./http/api-guards.ts"
import { compression } from "./http/compression.ts"
import { apiErrors } from "./http/errors.ts"
import { requestTimeZone } from "./http/request-time-zone.ts"
import { securityHeaders } from "./http/security-headers.ts"
import { staticSite } from "./http/static-site.ts"
import { banks } from "./routes/banks.ts"
import { finance } from "./routes/finance/index.ts"
import { invoices } from "./routes/invoices/index.ts"
import { publicInvoices } from "./routes/invoices/public.ts"
import { adminUser, sessionUser } from "./routes/session.ts"
import { sharing } from "./routes/sharing.ts"
import { work } from "./routes/work.ts"
import {
	BACKUP_DIR,
	hasTask,
	listBackups,
	listTasks,
	runTask,
	startScheduler,
} from "./tasks/scheduler.ts"
import { getUpdateInfo } from "./admin/updates.ts"
import { boundedString, id, jsonBody } from "./http/validation.ts"

runMigrations()
getOwnerId()
removeOldDebugDumps()

const adminSettings = () => ({
	registrationOpen: registrationOpen(),
	ownerId: getOwnerId(),
})
const adminSettingsBody = z.object({ registrationOpen: z.boolean() })
const backupNoteBody = z.object({ note: boundedString(200).optional() })
const taskParam = z.object({
	id: z.enum(["bank-refresh", "fx-rates", "backup", "tidy-up"]),
})
const backupNameParam = z.object({ name: boundedString(120) })
const AUDIT_PAGE_SIZE = 25
const auditQuery = z.object({
	kind: z.enum(["admin", "auth"]).optional(),
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(200)
		.default(AUDIT_PAGE_SIZE),
	offset: z.coerce.number().int().min(0).default(0),
})

/** Instance settings for admins. User management itself goes through Better Auth's /api/auth/admin/*. */
const admin = new Elysia({ name: "admin-routes", prefix: "/api/admin" }).use(
	adminUser
)
admin.get("/update", async () => await getUpdateInfo())
admin.get("/settings", () => adminSettings())
admin.put(
	"/settings",
	({ user, body, request }) => {
		if (body.registrationOpen !== registrationOpen()) {
			setSetting("registration_open", String(body.registrationOpen))
			audit({
				kind: "admin",
				ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
				actorId: user.id,
				actorEmail: user.email,
				action: body.registrationOpen
					? "Opened sign-ups"
					: "Closed sign-ups",
			})
		}
		return adminSettings()
	},
	{ body: jsonBody(adminSettingsBody) }
)
admin.post("/demo/reseed", ({ user, request }) => {
	reseedDemoData()
	audit({
		kind: "admin",
		ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
		actorId: user.id,
		actorEmail: user.email,
		action: "Reseeded demo data",
	})
	return { ok: true }
})
admin.get("/tasks", () => ({ tasks: listTasks() }))
admin.post(
	"/tasks/:id/run",
	({ user, params, request, status }) => {
		const { id: taskId } = params
		if (taskId === "backup" && !isInstanceOwner(user.id)) {
			return status(403, {
				error: "Only the instance owner can run backups.",
			})
		}
		if (!hasTask(taskId)) {
			return status(404, { error: "Not found" })
		}
		if (listTasks().find((task) => task.id === taskId)?.running) {
			return status(409, { error: "That task is already running." })
		}
		const label =
			listTasks().find((task) => task.id === taskId)?.label ?? taskId
		audit({
			kind: "admin",
			ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
			actorId: user.id,
			actorEmail: user.email,
			action: "Ran task",
			detail: label,
		})
		// It can take minutes (a browser per bank); the page polls for the result.
		void runTask(taskId, "manual", { by: user.name || user.email })
		return status(202, { tasks: listTasks() })
	},
	{ params: taskParam }
)
admin.get("/backups", ({ user, status }) => {
	if (!isInstanceOwner(user.id)) {
		return status(403, {
			error: "Only the instance owner can view backups.",
		})
	}
	return { backups: listBackups(), kept: env.BACKUPS_KEPT }
})
/** Back up now, with an optional note on why. Quick (one VACUUM INTO), so it waits for the copy. */
admin.post(
	"/backups",
	async ({ user, body, request, status }) => {
		if (!isInstanceOwner(user.id)) {
			return status(403, {
				error: "Only the instance owner can create backups.",
			})
		}
		const note = body.note?.trim().slice(0, 200) ?? ""
		const run = await runTask("backup", "manual", {
			by: user.name || user.email,
			note,
		})
		if (!run) {
			return status(409, { error: "A backup is already being made." })
		}
		if (run.status === "error") {
			return status(500, { error: run.summary ?? "The backup failed." })
		}
		audit({
			kind: "admin",
			ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
			actorId: user.id,
			actorEmail: user.email,
			action: "Backed up database",
			detail: note || undefined,
		})
		return { backups: listBackups(), summary: run.summary }
	},
	{ body: jsonBody(backupNoteBody) }
)
admin.get(
	"/backups/:name",
	({ user, params, request, status }) => {
		if (!isInstanceOwner(user.id)) {
			return status(403, {
				error: "Only the instance owner can download backups.",
			})
		}
		const { name } = params
		// Only names the backup task writes, so the path can't leave the backups folder.
		if (!listBackups().some((backup) => backup.name === name)) {
			return status(404, { error: "Not found" })
		}
		audit({
			kind: "admin",
			ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
			actorId: user.id,
			actorEmail: user.email,
			action: "Downloaded backup",
			detail: name,
		})
		return new Response(readFileSync(path.join(BACKUP_DIR, name)), {
			headers: {
				"Content-Type": "application/vnd.sqlite3",
				"Content-Disposition": `attachment; filename="${name}"`,
			},
		})
	},
	{ params: backupNameParam }
)
admin.get(
	"/audit",
	({ query }) =>
		recentAudit({
			kind: query.kind,
			limit: query.limit,
			offset: query.offset,
		}),
	{ query: auditQuery }
)

/**
 * The answer for any /api path no route claims. GET needs its own registration: the static site's
 * GET `/*` route would otherwise take those requests before the any-method wildcard is consulted.
 */
const apiNotFound = ({
	status,
}: {
	status: (code: 404, body: object) => unknown
}) => status(404, { error: "Not found" })

/** Everything under /api/banks needs a logged-in user; unknown paths there answer 401 before 404. */
const signedIn = new Elysia({ name: "logged-in-routes", prefix: "/api/banks" })
	.use(sessionUser)
	.use(banks)
	.use(finance)
	.use(work)
	.use(invoices)
	.use(sharing)
	.get("/*", apiNotFound)
	.all("/*", apiNotFound)

const app = new Elysia()
	.use(securityHeaders)
	.use(compression)
	.use(requestTimeZone)
	.use(apiGuards)

// In production, serve the built SPA from the same origin. Its not-found fallback has to run
// before the API's own error handler.
const dist = path.resolve(import.meta.dirname, "../../web/dist")
if (existsSync(dist)) {
	app.use(await staticSite(dist))
}

app.use(apiErrors)
	.get("/api/config", () => ({ registrationOpen: registrationOpen() }))
	// Better Auth reads the raw request itself, so Elysia must leave the body alone.
	.get("/api/auth/*", ({ request }) => auth.handler(request), {
		parse: "none",
	})
	.post(
		"/api/auth/*",
		({ request, status }) => {
			// Single-user by default: once an account exists, sign-up is closed (see ALLOW_REGISTRATION).
			const { pathname } = new URL(request.url)
			const isSignUp =
				pathname === "/api/auth/sign-up" ||
				pathname.startsWith("/api/auth/sign-up/")
			if (isSignUp && !registrationOpen()) {
				return status(403, { message: "Registration is closed." })
			}
			return auth.handler(request)
		},
		{ parse: "none" }
	)
	.use(signedIn)
	// Share links: anyone with the link can see that one invoice (and pay it), no login.
	.group("/api/public", (group) => group.use(publicInvoices))
	// PayPal's instant updates. Each delivery is checked with PayPal before anything is done with it.
	.post(
		"/api/webhooks/paypal/:connectionId",
		async ({ params, request, status }) => {
			const result = await handlePaypalWebhook(
				params.connectionId,
				request.headers,
				await request.text()
			)
			if (result.status !== 200) {
				console.warn(`PayPal webhook rejected: ${result.message}`)
			}
			return status(result.status, { message: result.message })
		},
		{ parse: "none", params: z.object({ connectionId: id }) }
	)
	.use(admin)
	.get("/api/*", apiNotFound)
	.all("/api/*", apiNotFound)
	.listen(
		{
			port: env.PORT,
			// Statement uploads are the one large body; everything else is held to 64 KB by apiGuards.
			maxRequestBodySize: STATEMENT_MAX_REQUEST_BYTES,
			// Bank refreshes and backups can take minutes; Bun's default would drop them after 10 s.
			idleTimeout: 255,
		},
		(server) => {
			console.log(`API listening on http://localhost:${server.port}`)
			// Session cookies are only marked Secure when APP_URL is https.
			const { hostname, protocol } = new URL(env.APP_URL)
			if (
				protocol !== "https:" &&
				hostname !== "localhost" &&
				hostname !== "127.0.0.1"
			) {
				console.warn(
					`[security] APP_URL (${env.APP_URL}) is not https: login cookies and passwords travel unencrypted.`
				)
			}
			startScheduler()
		}
	)

/** Older builds saved screenshots of bank pages to data/debug; they're no longer needed. */
function removeOldDebugDumps() {
	rmSync(path.join(env.DATA_DIR, "debug"), { recursive: true, force: true })
}
