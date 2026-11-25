import { Elysia } from "elysia"
import { CLIENT_IP_HEADER } from "../auth/hooks.ts"
import {
	STATEMENT_MAX_REQUEST_BYTES,
	STATEMENT_UPLOAD_PATH,
} from "../banks/upload-gate.ts"
import { env } from "../config/env.ts"

const API_PREFIX = "/api/"

/** Every API body is small JSON; statement uploads get their own, larger limit. */
const SMALL_BODY_LIMIT_BYTES = 64 * 1024

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const FORM_CONTENT_TYPE =
	/^\b(application\/x-www-form-urlencoded|multipart\/form-data|text\/(?:plain|ping))\b/i

let forwardedForWithoutTrustWarned = false

/**
 * Who's calling, for rate limits and the Devices list. With TRUST_PROXY set, the client address is
 * taken from X-Forwarded-For using the configured hop count; otherwise the socket address.
 */
function clientAddress(
	forwardedFor: string | null,
	socketAddress: string
): string {
	if (
		forwardedFor &&
		env.TRUST_PROXY === 0 &&
		!forwardedForWithoutTrustWarned
	) {
		forwardedForWithoutTrustWarned = true
		console.warn(
			"[security] X-Forwarded-For is present but TRUST_PROXY is unset; rate limits use the proxy address, not the visitor. Set TRUST_PROXY to the number of trusted hops."
		)
	}
	let address = socketAddress
	if (env.TRUST_PROXY > 0 && forwardedFor) {
		const hops = forwardedFor
			.split(",")
			.map((hop) => hop.trim())
			.filter(Boolean)
		const index = Math.max(0, hops.length - env.TRUST_PROXY)
		address = hops[index] ?? hops[0] ?? address
	}
	return address.replace(/^::ffff:/, "")
}

/**
 * Checks every `/api/` request before anything is parsed: refuses oversized bodies, rejects
 * cross-site form posts (JSON requests are already blocked by CORS preflight), and stamps the
 * caller's address into a header the auth hooks read (replacing any client-sent copy, so it can't
 * be used to dodge the sign-in limits).
 *
 * A chunked JSON body (no Content-Length) is refused outright; browsers always send the length
 * for the JSON bodies this app posts. Chunked statement uploads are capped by the server's
 * maximum request body size instead.
 */
export const apiGuards = new Elysia({ name: "api-guards" }).onRequest(
	({ request, server, status }) => {
		const { pathname } = new URL(request.url)
		if (!pathname.startsWith(API_PREFIX)) {
			return
		}

		const isUpload = pathname === STATEMENT_UPLOAD_PATH
		const limit = isUpload
			? STATEMENT_MAX_REQUEST_BYTES
			: SMALL_BODY_LIMIT_BYTES
		const contentLength = request.headers.get("content-length")
		// A chunked upload can't be measured up front; the server's own max body size still caps it.
		const isUnmeasured =
			!isUpload && request.headers.has("transfer-encoding")
		if (
			isUnmeasured ||
			(contentLength !== null && Number(contentLength) > limit)
		) {
			return status(413, {
				error: isUpload
					? "Upload is too large (50 MB at most)."
					: "Request too large",
			})
		}

		if (
			!SAFE_METHODS.has(request.method) &&
			FORM_CONTENT_TYPE.test(
				request.headers.get("content-type") || "text/plain"
			)
		) {
			const origin = request.headers.get("origin")
			const isSameOrigin =
				request.headers.get("sec-fetch-site") === "same-origin"
			if (!isSameOrigin && origin !== env.APP_URL) {
				return new Response("Forbidden", { status: 403 })
			}
		}

		request.headers.set(
			CLIENT_IP_HEADER,
			clientAddress(
				request.headers.get("x-forwarded-for"),
				server?.requestIP(request)?.address ?? ""
			)
		)
	}
)
