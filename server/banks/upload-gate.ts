const perUser = new Map<string, number>()
let globalActive = 0

export { STATEMENT_MAX_REQUEST_BYTES } from "../../shared/statement-upload.ts"
export const STATEMENT_MAX_PER_USER = 1
export const STATEMENT_MAX_GLOBAL = 2

export type UploadSlot =
  | { ok: true; release: () => void }
  | { ok: false; reason: "user" | "global" }

export function acquireStatementUpload(userId: string): UploadSlot {
  if (globalActive >= STATEMENT_MAX_GLOBAL)
    return { ok: false, reason: "global" }
  if ((perUser.get(userId) ?? 0) >= STATEMENT_MAX_PER_USER)
    return { ok: false, reason: "user" }
  globalActive++
  perUser.set(userId, (perUser.get(userId) ?? 0) + 1)
  let released = false
  return {
    ok: true,
    release: () => {
      if (released) return
      released = true
      globalActive = Math.max(0, globalActive - 1)
      const n = (perUser.get(userId) ?? 1) - 1
      if (n <= 0) perUser.delete(userId)
      else perUser.set(userId, n)
    },
  }
}
