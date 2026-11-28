/**
 * Splits an in-app URL string (path plus optional query and hash, as built by
 * the advisor and tax helpers) into the `to`/`search`/`hash` props TanStack
 * Router's `Link` expects, since a `?query` inside `to` would be treated as
 * part of the path and match no route.
 *
 * @param href In-app URL such as `/accounts?from=2025-01-01`.
 * @returns Props to spread onto `Link`.
 */
export function hrefTarget(href: string) {
	const url = new URL(href, "http://app.local")
	return {
		to: url.pathname,
		search: Object.fromEntries(url.searchParams),
		hash: url.hash.slice(1) || undefined,
	}
}
