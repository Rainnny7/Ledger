export interface BackupInfo {
  name: string
  size: number
  createdAt: string
  /** Null for copies made before reasons were recorded. */
  reason: {
    kind: "schedule" | "task" | "manual"
    by?: string
    note?: string
  } | null
}

/** Why a copy was made, in a few words. */
export function reasonText(r: BackupInfo["reason"]) {
  if (!r) return "Reason not recorded"
  if (r.kind === "schedule") return "Daily backup"
  const by = r.by ? ` by ${r.by}` : ""
  if (r.kind === "task") return `Backup task run by hand${by}`
  if (!r.note) return `Backed up by hand${by}`
  return r.by ? `“${r.note}” · ${r.by}` : `“${r.note}”`
}

export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
