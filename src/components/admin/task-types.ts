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

export const every = (ms: number) => {
  const h = ms / 3_600_000
  return h >= 24 && h % 24 === 0
    ? h === 24
      ? "Daily"
      : `Every ${h / 24} days`
    : `Every ${h} hours`
}

export const took = (ms: number) =>
  ms < 1000
    ? `${ms} ms`
    : ms < 60_000
      ? `${Math.round(ms / 1000)} s`
      : `${Math.round(ms / 60_000)} min`
