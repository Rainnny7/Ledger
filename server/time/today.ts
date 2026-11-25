/**
 * "Today" as the person using the app sees it. The browser sends its time zone (X-Timezone) and
 * each request runs inside it, so due dates and goal deadlines don't jump a day early or late
 * when the server runs in another zone (often UTC). Background work uses the server's own zone.
 */
import { AsyncLocalStorage } from "node:async_hooks"

const zone = new AsyncLocalStorage<string>()

/** A valid IANA zone name, or undefined. */
export function validTimeZone(tz: string | undefined): string | undefined {
	if (!tz || tz.length > 64) {
		return undefined
	}
	try {
		// oxlint-disable-next-line eslint/no-new -- validates IANA zone via Intl
		new Intl.DateTimeFormat("en-CA", { timeZone: tz })
		return tz
	} catch {
		return undefined
	}
}

/** Runs `fn` with "today" worked out in `tz` (when it's a real zone). */
export function inTimeZone<T>(tz: string | undefined, fn: () => T): T {
	const valid = validTimeZone(tz)
	return valid ? zone.run(valid, fn) : fn()
}

// Building a DateTimeFormat is slow, so keep one per zone (there are only a few hundred zones).
const dayFormats = new Map<string, Intl.DateTimeFormat>()

function dayFormat(tz: string) {
	let format = dayFormats.get(tz)
	if (!format) {
		format = new Intl.DateTimeFormat("en-CA", {
			timeZone: tz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		})
		dayFormats.set(tz, format)
	}
	return format
}

/** YYYY-MM-DD for `date` (default now) in the caller's time zone. */
export function todayIso(date = new Date()): string {
	const tz = zone.getStore()
	if (tz) {
		return dayFormat(tz).format(date)
	}
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
