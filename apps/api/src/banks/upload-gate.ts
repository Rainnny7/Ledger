const perUser = new Map<string, number>()
let globalActive = 0

export { STATEMENT_MAX_REQUEST_BYTES } from "@ledger/shared/statement-upload"

/** Where statement PDFs/zips are posted; the only API route allowed a large body. */
export const STATEMENT_UPLOAD_PATH = "/api/banks/statements"
/** Limits concurrent statement uploads to protect memory. */
export const STATEMENT_MAX_PER_USER = 1
/** Limits concurrent statement uploads to protect memory. */
export const STATEMENT_MAX_GLOBAL = 2

/** UploadSlot values accepted by validation and routes. */
export type UploadSlot =
	| { ok: true; release: () => void }
	| { ok: false; reason: "user" | "global" }

/** Reserve a concurrent upload slot or return a friendly busy error. */
export function acquireStatementUpload(userId: string): UploadSlot {
	if (globalActive >= STATEMENT_MAX_GLOBAL) {
		return { ok: false, reason: "global" }
	}
	if ((perUser.get(userId) ?? 0) >= STATEMENT_MAX_PER_USER) {
		return { ok: false, reason: "user" }
	}
	globalActive++
	perUser.set(userId, (perUser.get(userId) ?? 0) + 1)
	let released = false
	return {
		ok: true,
		release: () => {
			if (released) {
				return
			}
			released = true
			globalActive = Math.max(0, globalActive - 1)
			const remaining = (perUser.get(userId) ?? 1) - 1
			if (remaining <= 0) {
				perUser.delete(userId)
			} else {
				perUser.set(userId, remaining)
			}
		},
	}
}
