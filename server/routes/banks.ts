import { Elysia } from "elysia"
import { sessionUser } from "./session.ts"
import { z } from "zod"
import { fromCentsOrNull } from "../../shared/money.ts"
import { decrypt } from "../security/crypto.ts"
import { db } from "../db/connection.ts"
import type { AccountDetails } from "../banks/td/parse.ts"
import { loadTransactions } from "./finance/transactions.ts"
import {
	cancel,
	chooseMfa,
	getSession,
	isProvider,
	poll,
	PROVIDERS,
	startLogin,
	submitCode,
} from "../banks/sessions.ts"
import {
	deleteWebhook,
	PaypalApiError,
	purgePaypalTokenCache,
	registerWebhook,
} from "../banks/paypal/api.ts"
import { bankErrorForClient } from "../banks/errors.ts"
import { acquireStatementUpload } from "../banks/upload-gate.ts"
import { importStatements } from "../banks/statements.ts"
import { env } from "../config/env.ts"
import { isDemoUserId } from "../demo/personas.ts"
import { nextAutoSyncAt, waitingOnSignIn } from "../tasks/scheduler.ts"
import { boundedString, id, jsonBody } from "../http/validation.ts"

/** Elysia plugin wiring HTTP handlers for this area. */
export const banks = new Elysia({ name: "banks" }).use(sessionUser)

const idParam = z.object({ id: id })
const providerParam = z.object({ provider: boundedString(32) })

// ---------------------------------------------------------------- connect / 2FA flow

const connectBody = z.object({
	username: boundedString(200).trim().min(1).optional(),
	password: boundedString(200).min(1).optional(),
	remember: z.boolean().optional(),
	connectionId: id.optional(),
	full: z.boolean().optional(),
})

const mfaBody = z.object({ optionId: boundedString(200).min(1) })
const codeBody = z.object({
	code: z
		.string()
		.trim()
		.regex(/^[0-9A-Za-z]{4,10}$/),
})

banks.post(
	"/connect/:provider",
	async ({ user, params, body, status }) => {
		const { provider } = params
		if (!isProvider(provider)) {
			return status(404, { error: "Unknown provider" })
		}

		try {
			return await startLogin({ userId: user.id, provider, ...body })
		} catch (error) {
			return status(400, {
				error: bankErrorForClient(error, "connect", {
					site: isProvider(provider)
						? PROVIDERS[provider].site
						: undefined,
				}),
			})
		}
	},
	{ params: providerParam, body: jsonBody(connectBody) }
)

banks.get(
	"/connect/sessions/:id",
	async ({ user, params, status }) => {
		const { id: sessionId } = params
		const session = getSession(user.id, sessionId)
		if (!session) {
			return status(404, {
				error: "Session expired. Please start again.",
			})
		}
		return await poll(session)
	},
	{ params: idParam }
)

banks.post(
	"/connect/sessions/:id/mfa",
	async ({ user, params, body, status }) => {
		const { id: sessionId } = params
		const session = getSession(user.id, sessionId)
		if (!session) {
			return status(404, {
				error: "Session expired. Please start again.",
			})
		}
		const { optionId } = body
		return await chooseMfa(session, optionId)
	},
	{ params: idParam, body: jsonBody(mfaBody) }
)

banks.post(
	"/connect/sessions/:id/code",
	async ({ user, params, body, status }) => {
		const { id: sessionId } = params
		const session = getSession(user.id, sessionId)
		if (!session) {
			return status(404, {
				error: "Session expired. Please start again.",
			})
		}
		const { code } = body
		return await submitCode(session, code)
	},
	{ params: idParam, body: jsonBody(codeBody) }
)

banks.delete(
	"/connect/sessions/:id",
	async ({ user, params }) => {
		const { id: sessionId } = params
		const session = getSession(user.id, sessionId)
		if (session) {
			await cancel(session)
		}
		return { ok: true }
	},
	{ params: idParam }
)

// ---------------------------------------------------------------- statement uploads

const statementForm = z
	.object({
		connectionId: z.preprocess(
			(value) => (typeof value === "string" && value ? value : undefined),
			id.optional()
		),
		files: z
			.union([z.instanceof(File), z.array(z.instanceof(File))])
			.optional(),
	})
	.refine(
		(upload) => {
			const raw = upload.files
			const list =
				raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
			return list.filter((f): f is File => f instanceof File).length > 0
		},
		{
			message: "Choose at least one statement PDF or .zip file.",
			path: ["files"],
		}
	)

/** TD statement PDFs, or .zip archives of them, for history older than EasyWeb's 18 months. */
banks.post(
	"/statements",
	async ({ user, body, status }) => {
		const slot = acquireStatementUpload(user.id)
		if (!slot.ok) {
			return status(429, {
				error:
					slot.reason === "user"
						? "Another statement upload is already running for your account."
						: "The server is busy with other statement uploads. Try again shortly.",
			})
		}
		try {
			const { connectionId, files: rawFiles } = body
			const files = (
				rawFiles === undefined
					? []
					: Array.isArray(rawFiles)
						? rawFiles
						: [rawFiles]
			).filter((f): f is File => f instanceof File)
			const uploads = await Promise.all(
				files.map(async (file) => {
					const bytes = new Uint8Array(await file.arrayBuffer())
					return { name: file.name, bytes }
				})
			)
			return await importStatements(user.id, uploads, connectionId)
		} finally {
			slot.release()
		}
	},
	{ body: statementForm }
)

// ---------------------------------------------------------------- read data

const ACCOUNT_MONEY = [
	"balance",
	"available",
	"overdraftLimit",
	"overdraftUsed",
	"creditLimit",
] as const

/** An account row with its stored cents turned into the decimal amounts the API speaks. */
function accountFromCents<T extends object>(row: T): T {
	const out = { ...row } as Record<string, unknown>
	for (const field of ACCOUNT_MONEY) {
		out[field] = fromCentsOrNull(out[field] as number | null)
	}
	return out as T
}

banks.get("/connections", ({ user }) => {
	const connections = db
		.prepare<Record<string, unknown>, [string]>(
			`SELECT id, institution, label, username_masked AS usernameMasked, status,
              last_synced_at AS lastSyncedAt, last_error AS lastError, created_at AS createdAt,
              credentials_enc IS NOT NULL AS savedCredentials, webhook_id IS NOT NULL AS instantUpdates, webhook_at AS lastEventAt
         FROM bank_connection WHERE user_id = ? ORDER BY created_at`
		)
		.all(user.id)
	const accounts = db
		.prepare<Record<string, unknown>, [string]>(
			`SELECT a.id, a.connection_id AS connectionId, a.name, a.type, a.number_masked AS numberMasked, a.currency,
              a.balance, a.available, a.overdraft_limit AS overdraftLimit, a.overdraft_used AS overdraftUsed,
              a.credit_limit AS creditLimit, a.updated_at AS updatedAt,
              COALESCE(cnt.n, 0) AS transactionCount
         FROM bank_account a
         JOIN bank_connection c ON c.id = a.connection_id
         LEFT JOIN (
           SELECT account_id, COUNT(*) AS n FROM bank_transaction GROUP BY account_id
         ) cnt ON cnt.account_id = a.id
        WHERE c.user_id = ? ORDER BY a.type, a.name`
		)
		.all(user.id)
		.map(accountFromCents)
	return {
		connections: connections.map((connection) => {
			const row = connection as {
				id: string
				savedCredentials: number
				instantUpdates: number
				lastSyncedAt: string | null
				lastError: string | null
			}
			const savedCredentials = Boolean(row.savedCredentials)
			return {
				...connection,
				savedCredentials,
				instantUpdates: Boolean(row.instantUpdates),
				nextSyncAt: isDemoUserId(user.id)
					? null
					: nextAutoSyncAt({ ...row, savedCredentials }),
				needsSignIn:
					!isDemoUserId(user.id) &&
					waitingOnSignIn({ ...row, savedCredentials }),
			}
		}),
		accounts,
	}
})

banks.get(
	"/accounts/:id",
	({ user, params, status }) => {
		const { id: accountId } = params
		const account = db
			.prepare(
				`SELECT a.id, a.connection_id AS connectionId, a.name, a.type, a.number_masked AS numberMasked, a.currency,
              a.balance, a.available, a.overdraft_limit AS overdraftLimit, a.overdraft_used AS overdraftUsed,
              a.credit_limit AS creditLimit, a.updated_at AS updatedAt, a.history_from AS historyFrom,
              a.details_enc IS NOT NULL AS hasDetails
         FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id
        WHERE a.id = ? AND c.user_id = ?`
			)
			.get(accountId, user.id) as { hasDetails: number } | null
		if (!account) {
			return status(404, { error: "Not found" })
		}
		return {
			account: {
				...accountFromCents(account),
				hasDetails: Boolean(account.hasDetails),
			},
			transactions: loadTransactions(user.id, { accountId }),
		}
	},
	{ params: idParam }
)

/** Direct deposit numbers + limits. Separate from the account so the full number is only sent on request. */
banks.get(
	"/accounts/:id/details",
	({ user, params, set, status }) => {
		const { id: accountId } = params
		const row = db
			.prepare(
				`SELECT a.details_enc AS enc, a.details_updated_at AS updatedAt
         FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id
        WHERE a.id = ? AND c.user_id = ?`
			)
			.get(accountId, user.id) as
			| { enc: string | null; updatedAt: string | null }
			| undefined
		if (!row) {
			return status(404, { error: "Not found" })
		}
		let details: AccountDetails | null = null
		try {
			details = row.enc ? decrypt<AccountDetails>(row.enc) : null
		} catch {
			// Written with a different APP_SECRET; the next sync replaces it.
		}
		set.headers["cache-control"] = "no-store"
		return { details, updatedAt: details ? row.updatedAt : null }
	},
	{ params: idParam }
)

banks.delete(
	"/connections/:id",
	async ({ user, params, status }) => {
		const { id: connectionId } = params
		const hook = db
			.prepare(
				`SELECT webhook_id AS webhookId FROM bank_connection WHERE id = ? AND user_id = ? AND webhook_id IS NOT NULL`
			)
			.get(connectionId, user.id) as { webhookId: string } | null
		if (hook) {
			await deleteWebhook(connectionId, hook.webhookId).catch((error) =>
				console.error("PayPal webhook removal failed", error)
			)
		}
		purgePaypalTokenCache(connectionId)
		const result = db
			.prepare(`DELETE FROM bank_connection WHERE id = ? AND user_id = ?`)
			.run(connectionId, user.id)
		return result.changes
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

banks.post(
	"/connections/:id/forget-credentials",
	({ user, params, status }) => {
		const { id: connectionId } = params
		const row = db
			.prepare(
				`SELECT institution FROM bank_connection WHERE id = ? AND user_id = ?`
			)
			.get(connectionId, user.id) as { institution: string } | undefined
		if (!row) {
			return status(404, { error: "Not found" })
		}
		db.prepare(
			`UPDATE bank_connection SET credentials_enc = NULL WHERE id = ? AND user_id = ?`
		).run(connectionId, user.id)
		if (row.institution === "paypal") {
			purgePaypalTokenCache(connectionId)
		}
		return { ok: true }
	},
	{ params: idParam }
)

// ---------------------------------------------------------------- PayPal instant updates (webhooks)

/** Where PayPal delivers this connection's events. */
export const webhookUrl = (connectionId: string) =>
	`${env.publicUrl}/api/webhooks/paypal/${connectionId}`

banks.post(
	"/connections/:id/instant-updates",
	async ({ user, params, status }) => {
		const { id: connectionId } = params
		const row = db
			.prepare(
				`SELECT institution, credentials_enc AS creds FROM bank_connection WHERE id = ? AND user_id = ?`
			)
			.get(connectionId, user.id) as
			| { institution: string; creds: string | null }
			| undefined
		if (!row || row.institution !== "paypal") {
			return status(404, { error: "Not found" })
		}
		const url = webhookUrl(connectionId)
		const host = new URL(url).hostname
		if (
			!url.startsWith("https://") ||
			host === "localhost" ||
			/^(127\.|10\.|192\.168\.|\[?::1)/.test(host)
		) {
			return status(400, {
				error: "PayPal can only send updates to a public https:// address. Put Ledger behind one (a domain, or a tunnel such as Cloudflare Tunnel) and set PUBLIC_URL to it.",
			})
		}
		try {
			const webhookId = await registerWebhook(connectionId, url)
			db.prepare(
				`UPDATE bank_connection SET webhook_id = ? WHERE id = ? AND user_id = ?`
			).run(webhookId, connectionId, user.id)
			return { ok: true, url }
		} catch (error) {
			console.error("PayPal webhook registration failed", error)
			const msg =
				error instanceof PaypalApiError
					? error.message
					: "Could not reach PayPal."
			return status(502, {
				error: `PayPal did not accept the webhook: ${msg}`,
			})
		}
	},
	{ params: idParam }
)

banks.delete(
	"/connections/:id/instant-updates",
	async ({ user, params, status }) => {
		const { id: connectionId } = params
		const row = db
			.prepare(
				`SELECT webhook_id AS webhookId FROM bank_connection WHERE id = ? AND user_id = ?`
			)
			.get(connectionId, user.id) as
			| { webhookId: string | null }
			| undefined
		if (!row) {
			return status(404, { error: "Not found" })
		}
		if (row.webhookId) {
			try {
				await deleteWebhook(connectionId, row.webhookId)
			} catch (error) {
				console.error("PayPal webhook removal failed", error)
			}
		}
		db.prepare(
			`UPDATE bank_connection SET webhook_id = NULL WHERE id = ? AND user_id = ?`
		).run(connectionId, user.id)
		return { ok: true }
	},
	{ params: idParam }
)
