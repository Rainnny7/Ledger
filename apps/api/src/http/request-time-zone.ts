import { Elysia } from "elysia"
import { inTimeZone } from "../time/today.ts"

/**
 * Runs each request in the caller's time zone (the browser's X-Timezone header), so "today" for
 * due dates and deadlines matches the person using the app. Wrapping the whole request keeps the
 * zone visible to everything the handler awaits.
 */
export const requestTimeZone = new Elysia({ name: "request-time-zone" }).wrap(
	(handle, request) => (incoming: Request) =>
		inTimeZone(request.headers.get("x-timezone") ?? undefined, () =>
			handle(incoming)
		)
)
