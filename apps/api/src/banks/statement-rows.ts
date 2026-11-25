import { isoDate, money } from "../http/validation.ts"
import type { ScrapedTransaction } from "./types.ts"

/** Max characters kept from imported statement descriptions. */
export const MAX_STATEMENT_DESCRIPTION = 500

/** ValidStatementRow values accepted by validation and routes. */
export type ValidStatementRow = {
	date: string
	description: string
	amount: number
	runningBalance: number | null
	pending: boolean
}

/** Validate a parsed statement row before inserting transactions. */
export function validateStatementRow(
	t: ScrapedTransaction
): { ok: true; row: ValidStatementRow } | { ok: false } {
	const date = isoDate.safeParse(t.date)
	if (!date.success) {
		return { ok: false }
	}
	const amount = money.safeParse(t.amount)
	if (!amount.success) {
		return { ok: false }
	}
	const desc = t.description.trim()
	if (!desc || desc.length > MAX_STATEMENT_DESCRIPTION) {
		return { ok: false }
	}
	const running =
		t.runningBalance === null ? null : money.safeParse(t.runningBalance)
	if (t.runningBalance !== null && !running?.success) {
		return { ok: false }
	}
	return {
		ok: true,
		row: {
			date: date.data,
			description: desc,
			amount: amount.data,
			runningBalance: running?.success ? running.data : null,
			pending: Boolean(t.pending),
		},
	}
}
