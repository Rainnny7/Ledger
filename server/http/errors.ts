import { Elysia } from "elysia"
import type { z } from "zod"
import { invalidRequestBody, zodIssues } from "./validation.ts"

/** The part of Elysia's validation error that carries the Zod schema and the rejected value. */
interface ZodValidationFailure {
	validator?: { schema?: z.ZodType }
	value?: unknown
	message: string
}

/**
 * The API's error envelope. Invalid input becomes `400 { error: "Invalid request", issues }`
 * (the issues come from re-running the route's Zod schema), unreadable JSON the same with a
 * "Malformed JSON" issue, and anything unexpected a logged 500 that doesn't leak details.
 * Registered globally, so every route plugin mounted after it answers the same way.
 */
export const apiErrors = new Elysia({ name: "api-errors" }).onError(
	{ as: "global" },
	({ code, error, status }) => {
		if (code === "VALIDATION") {
			const failure = error as ZodValidationFailure
			const parsed = failure.validator?.schema?.safeParse(failure.value)
			return status(
				400,
				invalidRequestBody(
					parsed && !parsed.success
						? zodIssues(parsed.error)
						: [{ path: "", message: failure.message }]
				)
			)
		}
		if (code === "PARSE") {
			return status(
				400,
				invalidRequestBody([{ path: "", message: "Malformed JSON" }])
			)
		}
		if (code === "NOT_FOUND") {
			return new Response("404 Not Found", { status: 404 })
		}
		console.error(error)
		return status(500, { error: "Something went wrong." })
	}
)
