/** Per-key sliding-window counter shared by lookup, share creation, and similar guards. */
export type SlidingWindowRateLimit = {
	/** Records this attempt; returns true when the key is over the limit. */
	record: (key: string) => boolean
}

/**
 * Attempts allowed per key per window. Matches `/api/auth/lookup` (10 per minute) and evicts
 * idle keys when the map grows past `trackedCap`.
 */
export function slidingWindowRateLimit(options: {
	max: number
	windowMs: number
	trackedCap?: number
}): SlidingWindowRateLimit {
	const hits = new Map<string, number[]>()
	const trackedCap = options.trackedCap ?? 5000

	return {
		record(key: string): boolean {
			const now = Date.now()
			const recent = (hits.get(key) ?? []).filter(
				(hitTime) => now - hitTime < options.windowMs
			)
			recent.push(now)
			hits.set(key, recent)
			if (hits.size > trackedCap) {
				for (const [entry, times] of hits) {
					if (
						times.every(
							(hitTime) => now - hitTime >= options.windowMs
						)
					) {
						hits.delete(entry)
					}
				}
			}
			return recent.length > options.max
		},
	}
}