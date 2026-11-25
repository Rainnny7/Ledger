import { useSyncExternalStore } from "react"

let now = new Date()

/** Moves `now` on when the hour changes, so dates and greetings stay right in a tab left open overnight. */
function subscribe(onChange: () => void) {
	const id = window.setInterval(() => {
		const next = new Date()
		if (
			next.getHours() !== now.getHours() ||
			next.toDateString() !== now.toDateString()
		) {
			now = next
			onChange()
		}
	}, 60_000)
	return () => window.clearInterval(id)
}

/**
 * The current time to render with, to the hour. Reading `new Date()` during render gives a different
 * answer on every render; this one only changes when the hour does (and re-renders when it does).
 */
export function useNow(): Date {
	return useSyncExternalStore(
		subscribe,
		() => now,
		() => now
	)
}
