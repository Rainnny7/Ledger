/** Production static hosting for the Vite-built SPA and long-lived asset caching. */
import path from "node:path"
import { staticPlugin } from "@elysiajs/static"
import { Elysia } from "elysia"

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable"

/**
 * Serves the built single-page app from `distDirectory`. Any other GET outside `/api/` answers
 * with `index.html` so client-side routes survive a reload. Hashed bundles under `/assets/` cache
 * forever; HTML (the root and extension-less paths) must stay fresh for new deploys.
 *
 * Mount it before the API error handler: its not-found fallback has to run first.
 */
export async function staticSite(distDirectory: string) {
	const indexHtml = path.join(distDirectory, "index.html")
	return new Elysia({ name: "static-site" })
		.onAfterHandle({ as: "global" }, ({ request, set }) => {
			const { pathname } = new URL(request.url)
			if (pathname.startsWith("/api/")) {
				return
			}
			if (pathname.startsWith("/assets/")) {
				set.headers["cache-control"] = IMMUTABLE_CACHE
			} else if (pathname === "/" || !pathname.includes(".")) {
				set.headers["cache-control"] = "no-cache"
			}
		})
		.onError({ as: "global" }, ({ code, request, set }) => {
			const { pathname } = new URL(request.url)
			if (
				code === "NOT_FOUND" &&
				request.method === "GET" &&
				!pathname.startsWith("/api/")
			) {
				const headers: Record<string, string> = {
					"content-type": "text/html;charset=utf-8",
				}
				if (!pathname.includes(".")) {
					headers["cache-control"] = "no-cache"
				}
				// The not-found error left a 404 on the response; the app shell itself is a normal page.
				set.status = 200
				return new Response(Bun.file(indexHtml), { headers })
			}
		})
		.use(
			await staticPlugin({
				assets: distDirectory,
				prefix: "/",
				alwaysStatic: false,
				maxAge: null,
			})
		)
}
