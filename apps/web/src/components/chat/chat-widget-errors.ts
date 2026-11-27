/** Parse the server `{ error }` body from a failed chat request. */
export function chatErrorMessage(error: Error): string {
	const responseBody =
		"responseBody" in error && typeof error.responseBody === "string"
			? error.responseBody
			: undefined
	const fromResponse = parseErrorBody(responseBody)
	if (fromResponse) {
		return fromResponse
	}
	const fromMessage = parseErrorBody(error.message)
	if (fromMessage) {
		return fromMessage
	}
	return error.message || "Something went wrong. Try again."
}

function parseErrorBody(body: string | undefined): string | null {
	if (!body) {
		return null
	}
	try {
		const parsed = JSON.parse(body) as { error?: string }
		return parsed.error ?? null
	} catch {
		return null
	}
}
