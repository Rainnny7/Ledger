/** Minimal Docker Engine API client over the unix socket (Bun's `fetch` `unix` option). */

/** Default Docker socket path inside the container. */
export const DOCKER_SOCKET = "/var/run/docker.sock"

/**
 * Calls the Docker Engine API and returns the parsed JSON body (or raw text when it isn't JSON).
 * Throws with the engine's message on a non-2xx status.
 */
export async function dockerRequest<T = unknown>(
	method: string,
	endpoint: string,
	body?: unknown
): Promise<T> {
	const response = await fetch(`http://docker${endpoint}`, {
		method,
		unix: DOCKER_SOCKET,
		headers:
			body === undefined
				? undefined
				: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const text = await response.text()
	if (!response.ok) {
		throw new Error(
			`Docker ${method} ${endpoint}: ${response.status} ${text}`
		)
	}
	try {
		return JSON.parse(text) as T
	} catch {
		return text as T
	}
}
