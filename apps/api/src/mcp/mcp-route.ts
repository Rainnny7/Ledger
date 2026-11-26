import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Elysia } from "elysia"
import { mcpEnabled } from "../auth/index.ts"
import { financeToolDefinitions } from "../chat/tools.ts"
import { MCP_PATH } from "./path.ts"
import { resolveMcpToken } from "./tokens.ts"

/** Sliding window and ceiling for requests per token. */
const MCP_RATE_WINDOW_MS = 10 * 60 * 1000
const MCP_REQUESTS_PER_WINDOW = 120

/** Largest JSON-RPC body the transport will read. */
const MCP_MAX_BODY_BYTES = 64 * 1024

const MCP_INSTRUCTIONS =
	"Read-only access to one person's Ledger personal finances: accounts, transactions, spending summaries, budgets, subscriptions and goals. Start with financialOverview for broad questions, then use the narrower tools. Amounts are decimal money values in the currency named in each result; negative transaction amounts are spending. This server cannot change any data."

const requestTimes = new Map<string, number[]>()

/** Records one request for a token; true when it is over its allowance for the window. */
function rateLimited(tokenId: string): boolean {
	const now = Date.now()
	const recent = (requestTimes.get(tokenId) ?? []).filter(
		(time) => now - time < MCP_RATE_WINDOW_MS
	)
	if (recent.length >= MCP_REQUESTS_PER_WINDOW) {
		requestTimes.set(tokenId, recent)
		return true
	}
	recent.push(now)
	requestTimes.set(tokenId, recent)
	return false
}

/** Pulls the token out of `Authorization: Bearer <token>`; null when absent or malformed. */
function bearerToken(request: Request): string | null {
	const match = /^Bearer\s+(\S+)$/i.exec(
		request.headers.get("authorization") ?? ""
	)
	return match ? match[1] : null
}

/** Builds a throwaway MCP server exposing the read-only finance tools for one user. */
export function createMcpServer(userId: string): McpServer {
	const server = new McpServer(
		{ name: "ledger", version: "1.0.0" },
		{ instructions: MCP_INSTRUCTIONS }
	)
	for (const definition of financeToolDefinitions) {
		server.registerTool(
			definition.name,
			{
				description: definition.description,
				inputSchema: definition.inputSchema,
				annotations: {
					readOnlyHint: true,
					destructiveHint: false,
					idempotentHint: true,
					openWorldHint: false,
				},
			},
			async (input: unknown) => ({
				content: [
					{
						type: "text" as const,
						text: JSON.stringify(
							definition.run(userId, input as never)
						),
					},
				],
			})
		)
	}
	return server
}

function jsonError(
	status: number,
	error: string,
	headers: Record<string, string> = {}
): Response {
	return new Response(JSON.stringify({ error }), {
		status,
		headers: { "content-type": "application/json", ...headers },
	})
}

/**
 * Handles one MCP request statelessly: checks the method, the admin flag and the bearer token,
 * then serves it with a fresh server and transport (no sessions, no streams). Neither the token
 * nor tool arguments are ever logged.
 */
export async function handleMcpRequest(request: Request): Promise<Response> {
	if (request.method !== "POST") {
		return jsonError(405, "Use POST.", { allow: "POST" })
	}
	if (!mcpEnabled()) {
		return jsonError(503, "The MCP server is turned off on this instance.")
	}
	const rawToken = bearerToken(request)
	const resolved = rawToken ? resolveMcpToken(rawToken) : "invalid"
	if (resolved === "invalid") {
		return jsonError(401, "Unauthorized", {
			"www-authenticate": 'Bearer realm="ledger"',
		})
	}
	if (resolved === "password-change-required") {
		return jsonError(403, "Choose a new password in Ledger to continue.")
	}
	if (rateLimited(resolved.tokenId)) {
		return jsonError(429, "Too many requests. Try again in a few minutes.")
	}
	const server = createMcpServer(resolved.userId)
	const transport = new WebStandardStreamableHTTPServerTransport({
		enableJsonResponse: true,
		maxRequestBodySize: MCP_MAX_BODY_BYTES,
	})
	await server.connect(transport)
	try {
		const response = await transport.handleRequest(request)
		response.headers.set("cache-control", "no-store")
		return response
	} finally {
		await transport.close()
		await server.close()
	}
}

/** `/api/mcp`: stateless Streamable HTTP MCP endpoint authenticated by personal API tokens. */
export const mcpRoutes = new Elysia({ name: "mcp-routes" }).all(
	MCP_PATH,
	({ request }) => handleMcpRequest(request),
	{ parse: "none" }
)
