/** Small helpers shared by the demo generators and seeders. */
export const toIsoDate = (date: Date) => date.toISOString().slice(0, 10)

/** Small deterministic PRNG so the demo looks the same every day (just shifted). */
export function createRandom(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0
		let state = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		state = (state + Math.imul(state ^ (state >>> 7), 61 | state)) ^ state
		return ((state ^ (state >>> 14)) >>> 0) / 4294967296
	}
}

/** Shape of Draft as stored and returned by the API. */
export interface Draft {
	date: string
	description: string
	amount: number
}
