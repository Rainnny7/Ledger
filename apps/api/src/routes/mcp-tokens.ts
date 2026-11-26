import { Elysia } from "elysia"
import { z } from "zod"
import { boundedString, id, jsonBody } from "../http/validation.ts"
import {
	createMcpToken,
	listMcpTokens,
	MAX_MCP_TOKENS_PER_USER,
	revokeMcpToken,
} from "../mcp/tokens.ts"
import { sessionUser } from "./session.ts"

const createBody = z.object({ name: boundedString(60).trim().min(1) })
const idParam = z.object({ id })

/** Session-authenticated management of the signed-in user's MCP API tokens (mounted under /api/banks). */
export const mcpTokens = new Elysia({ name: "mcp-token-routes" })
	.use(sessionUser)
	.get("/mcp-tokens", ({ user }) => ({ tokens: listMcpTokens(user.id) }))
	.post(
		"/mcp-tokens",
		({ user, body, status }) => {
			const created = createMcpToken(user.id, body.name)
			if (!created) {
				return status(409, {
					error: `You can have up to ${MAX_MCP_TOKENS_PER_USER} tokens. Revoke one first.`,
				})
			}
			return status(201, { token: created.token, row: created.row })
		},
		{ body: jsonBody(createBody) }
	)
	.delete(
		"/mcp-tokens/:id",
		({ user, params, status }) =>
			revokeMcpToken(user.id, params.id)
				? { ok: true }
				: status(404, { error: "Not found" }),
		{ params: idParam }
	)
