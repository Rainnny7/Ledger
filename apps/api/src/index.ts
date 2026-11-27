import { existsSync, readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { Elysia } from "elysia"
import { z } from "zod"
import {
	audit,
	getOwnerId,
	getReleaseChannel,
	setReleaseChannel,
	isInstanceOwner,
	recentAudit,
} from "./admin/store.ts"
import {
	aiChatAvailable,
	aiChatEnabled,
	auth,
	mcpEnabled,
	registrationOpen,
} from "./auth/index.ts"
import { CLIENT_IP_HEADER } from "./auth/hooks.ts"
import { turnstileSiteKey, verifyCaptcha } from "./auth/captcha.ts"
import { authLookup } from "./auth/lookup.ts"
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
import { chatRoutes } from "./chat/chat-route.ts"
import { aiChatLimits } from "./chat/limits.ts"
import { mcpTokens } from "./routes/mcp-tokens.ts"
import { mcpRoutes } from "./mcp/mcp-route.ts"
import { apiV1 } from "./routes/api-v1.ts"
import { sharing } from "./routes/sharing.ts"
import { work } from "./routes/work.ts"
import { notifications } from "./routes/notifications.ts"
import { adminMail } from "./routes/admin-mail.ts"
import {
	BACKUP_DIR,
	hasTask,
	listBackups,
	listTasks,
	MAX_INTERVAL_HOURS,
	MIN_INTERVAL_HOURS,
	runTask,
	setTaskIntervalHours,
	startScheduler,
} from "./tasks/scheduler.ts"
import {
	dockerSwitchAvailable,
	startContainerSwitch,
} from "./admin/docker-switch.ts"
import { clearUpdateCache, getUpdateInfo } from "./admin/updates.ts"
import { boundedString, id, jsonBody } from "./http/validation.ts"
import { isSmtpConfigured } from "./mail/smtp.ts"
import { spendingDigestAvailable } from "./digest/service.ts"
import { digestRoutes, publicDigest } from "./routes/digest.ts"

runMigrations()
getOwnerId()
removeOldDebugDumps()

const adminSettings = () => ({
	registrationOpen: registrationOpen(),
	ownerId: getOwnerId(),
	aiChat: {
		configured: Boolean(env.AI_API_KEY),
		enabled: aiChatEnabled(),
		model: env.AI_MODEL,
		limits: aiChatLimits,
	},
	mcp: { enabled: mcpEnabled() },
	releaseChannel: getReleaseChannel(),
})
const adminSettingsBody = z
	.object({
		registrationOpen: z.boolean().optional(),
		aiChatEnabled: z.boolean().optional(),
		mcpEnabled: z.boolean().optional(),
		releaseChannel: z.enum(["stable", "dev"]).optional(),
	})
	.refine(
		(body) =>
			body.registrationOpen !== undefined ||
			body.aiChatEnabled !== undefined ||
			body.mcpEnabled !== undefined ||
			body.releaseChannel !== undefined,
		{ message: "At least one setting is required" }
	)
const backupNoteBody = z.object({ note: boundedString(200).optional() })
const taskParam = z.object({ id: boundedString(40) })
const backupNameParam = z.object({ name: boundedString(120) })
const AUDIT_PAGE_SIZE = 25
const auditQuery = z.object({
	kind: z.enum(["admin", "auth"]).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(AUDIT_PAGE_SIZE),
	offset: z.coerce.number().int().min(0).default(0),
})

/** Instance settings for admins. User management itself goes through Better Auth's /api/auth/admin/*. */
const admin = new Elysia({ name: "admin-routes", prefix: "/api/admin" }).use(
	adminUser
)
admin.get("/update", async () => ({
	...(await getUpdateInfo(getReleaseChannel())),
	canSwitch: await dockerSwitchAvailable(),
}))
/** Pulls the selected channel's image and swaps this container for one running it (needs the Docker socket). */
admin.post("/update/switch", async ({ user, request, status }) => {
	if (!(await dockerSwitchAvailable())) {
		return status(409, {
			error: "Mount /var/run/docker.sock into the container to switch from here.",
		})
	}
	const info = await getUpdateInfo(getReleaseChannel())
	if (!info.imageTag) {
		return status(409, {
			error: "Could not determine the image to switch to. Try again shortly.",
		})
	}
	try {
		await startContainerSwitch(info.imageTag)
	} catch (error) {
		return status(502, { error: (error as Error).message })
	}
	audit({
		kind: "admin",
		ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
		actorId: user.id,
		actorEmail: user.email,
		action: "Switched container image",
		detail: info.imageTag,
	})
	return { ok: true, imageTag: info.imageTag }
})
admin.get("/settings", () => adminSettings())
admin.put(
	"/settings",
	({ user, body, request }) => {
		if (
			body.registrationOpen !== undefined &&
			body.registrationOpen !== registrationOpen()
		) {
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
		if (
			body.aiChatEnabled !== undefined &&
			body.aiChatEnabled !== aiChatEnabled()
		) {
			setSetting("ai_chat_enabled", String(body.aiChatEnabled))
			audit({
				kind: "admin",
				ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
				actorId: user.id,
				actorEmail: user.email,
				action: body.aiChatEnabled
					? "Enabled AI chat"
					: "Disabled AI chat",
			})
		}
		if (
			body.releaseChannel !== undefined &&
			body.releaseChannel !== getReleaseChannel()
		) {
			setReleaseChannel(body.releaseChannel)
			clearUpdateCache()
			audit({
				kind: "admin",
				ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
				actorId: user.id,
				actorEmail: user.email,
				action: "Changed release channel",
				detail: body.releaseChannel,
			})
		}
		if (body.mcpEnabled !== undefined && body.mcpEnabled !== mcpEnabled()) {
			setSetting("mcp_enabled", String(body.mcpEnabled))
			audit({
				kind: "admin",
				ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
				actorId: user.id,
				actorEmail: user.email,
				action: body.mcpEnabled
					? "Enabled MCP server"
					: "Disabled MCP server",
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
admin.put(
	"/tasks/:id/interval",
	({ user, params, body, request, status }) => {
		if (params.id === "backup" && !isInstanceOwner(user.id)) {
			return status(403, {
				error: "Only the instance owner can change the backup schedule.",
			})
		}
		if (!setTaskIntervalHours(params.id, body.hours)) {
			return status(404, { error: "Not found" })
		}
		audit({
			kind: "admin",
			ip: request.headers.get(CLIENT_IP_HEADER) ?? undefined,
			actorId: user.id,
			actorEmail: user.email,
			action: "Changed task schedule",
			detail: `${params.id}: every ${body.hours} hours`,
		})
		return { tasks: listTasks() }
	},
	{
		params: taskParam,
		body: z.object({
			hours: z.number().min(MIN_INTERVAL_HOURS).max(MAX_INTERVAL_HOURS),
		}),
	}
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
admin.use(adminMail)

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
	.use(chatRoutes)
	.use(banks)
	.use(finance)
	.use(work)
	.use(invoices)
	.use(sharing)
	.use(mcpTokens)
	.use(digestRoutes)
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
	.get("/api/config", () => ({
		registrationOpen: registrationOpen(),
		aiChat: aiChatAvailable(),
		mcp: mcpEnabled(),
		turnstileSiteKey,
		emailLinks: isSmtpConfigured(),
		spendingDigest: spendingDigestAvailable(),
	}))
	.use(
		authLookup({
			registrationOpen,
			verifyCaptcha,
		})
	)
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
	.use(mcpRoutes)
	.use(apiV1)
	.use(notifications)
	// Share links: anyone with the link can see that one invoice (and pay it), no login.
	.group("/api/public", (group) =>
		group.use(publicInvoices).use(publicDigest)
	)
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
			// Statement uploads are the largest body; chat JSON is capped at 512 KB in apiGuards.
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
