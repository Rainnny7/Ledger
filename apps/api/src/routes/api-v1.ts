import { Elysia } from "elysia"
import { z } from "zod"
import { apiKeyUser } from "../api-keys/guard.ts"
import {
	listTransactionsForApi,
	transactionsQuery,
} from "../api-keys/queries.ts"
import { API_V1_PATH } from "../api-keys/config.ts"
import {
	financialOverviewForUser,
	listAccountsForUser,
	spendingSummaryForUser,
} from "../chat/tools.ts"
import { isoDate } from "../http/validation.ts"

const spendingQuery = z.object({
	from: isoDate,
	until: isoDate,
	groupBy: z.enum(["category", "merchant", "month"]).default("category"),
})

/**
 * Read-only REST API for personal API keys (`/api/v1`). Every handler gets the key owner's id from
 * the guard and passes it to the same data-access functions the AI chat and MCP server use, so
 * nothing can reach another user's data. Only GET routes exist; unknown paths answer 404 after auth.
 */
export const apiV1 = new Elysia({ name: "api-v1-routes", prefix: API_V1_PATH })
	.use(apiKeyUser)
	.get("/accounts", ({ userId }) => listAccountsForUser(userId))
	.get(
		"/transactions",
		({ userId, query }) => listTransactionsForApi(userId, query),
		{ query: transactionsQuery }
	)
	.get(
		"/spending",
		({ userId, query }) => spendingSummaryForUser(userId, query),
		{ query: spendingQuery }
	)
	.get("/overview", ({ userId }) => financialOverviewForUser(userId))
	.get("/*", ({ status }) => status(404, { error: "Not found" }))
	.all("/*", ({ status }) => status(404, { error: "Not found" }))
