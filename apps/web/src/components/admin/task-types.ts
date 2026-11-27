/** Task Info. */
export interface TaskInfo {
	id: string
	label: string
	description: string
	intervalMs: number
	running: boolean
	nextRunAt: string | null
	lastRun: {
		startedAt: string
		finishedAt: string | null
		durationMs: number | null
		status: "running" | "ok" | "error"
		summary: string | null
		steps: { label: string; durationMs: number }[]
		trigger: "schedule" | "manual"
	} | null
}

/** Human label for a scheduled interval in milliseconds. */
export const every = (ms: number) => {
	const hours = ms / 3_600_000
	return hours >= 24 && hours % 24 === 0
		? hours === 24
			? "Daily"
			: `Every ${hours / 24} days`
		: `Every ${hours} hours`
}

/** Duration with finer detail than `took`, for the per-step breakdown. */
export const tookPrecisely = (ms: number) =>
	ms < 1000
		? `${ms} ms`
		: ms < 60_000
			? `${(ms / 1000).toFixed(1)} s`
			: took(ms)

/** Short duration label for a finished task run. */
export const took = (ms: number) =>
	ms < 1000
		? `${ms} ms`
		: ms < 60_000
			? `${Math.round(ms / 1000)} s`
			: `${Math.round(ms / 60_000)} min`
