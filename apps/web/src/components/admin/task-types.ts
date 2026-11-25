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

/** Short duration label for a finished task run. */
export const took = (ms: number) =>
	ms < 1000
		? `${ms} ms`
		: ms < 60_000
			? `${Math.round(ms / 1000)} s`
			: `${Math.round(ms / 60_000)} min`
