/** Baseline security headers (CSP, HSTS in production) on every response. */
import { Elysia } from "elysia"

/** Content Security Policy for the single-page app and its API. */
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	// The invoice PDF renderer is WebAssembly.
	"script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
	// Tailwind/Base UI set inline style attributes; charts use inline SVG styles.
	"style-src 'self' 'unsafe-inline'",
	// Currency flags in the pickers.
	"img-src 'self' data: blob: https://flagcdn.com",
	// The PDF preview is a blob: document in a frame; Cloudflare Turnstile runs in its own frame.
	"frame-src 'self' blob: https://challenges.cloudflare.com",
	"font-src 'self' data:",
	"connect-src 'self' https://challenges.cloudflare.com",
	"frame-ancestors 'none'",
	"form-action 'self'",
	"base-uri 'self'",
	"object-src 'none'",
].join("; ")

const SECURITY_HEADERS = {
	"content-security-policy": CONTENT_SECURITY_POLICY,
	"cross-origin-opener-policy": "same-origin",
	"cross-origin-resource-policy": "same-origin",
	"origin-agent-cluster": "?1",
	"permissions-policy":
		"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
	"referrer-policy": "same-origin",
	"strict-transport-security": "max-age=15552000; includeSubDomains",
	"x-content-type-options": "nosniff",
	"x-dns-prefetch-control": "off",
	"x-download-options": "noopen",
	"x-frame-options": "SAMEORIGIN",
	"x-permitted-cross-domain-policies": "none",
	"x-xss-protection": "0",
}

/** Adds the browser hardening headers (CSP, framing, referrer, HSTS, ...) to every response. */
export const securityHeaders = new Elysia({
	name: "security-headers",
}).onRequest(({ set }) => {
	Object.assign(set.headers, SECURITY_HEADERS)
})
