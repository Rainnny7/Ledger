import type { Category } from "../../../shared/categories.ts"
import type { TaxTag } from "../../../shared/categories.ts"

/** A stored transaction row: `amount` and `runningBalance` are cents. */
export interface TxRow {
	id: string
	accountId: string
	date: string
	description: string
	amount: number
	runningBalance: number | null
	pending: number
	categoryOverride: string | null
	taxTagRaw: string | null
	note: string | null
	createdAt: string
	institution: string
}

/** A transaction as the API shows it: decimal `amount` and `runningBalance`. */
export interface EnrichedTx extends Omit<
	TxRow,
	"pending" | "categoryOverride" | "taxTagRaw" | "institution"
> {
	pending: boolean
	merchant: string
	merchantKey: string
	category: Category
	categorySource: "auto" | "rule" | "manual"
	/** Business or personal for the tax report; null while untagged. */
	taxTag: TaxTag | null
	/** manual: set on this transaction · rule: the merchant's rule · auto: a payment for one of your bills or invoices. */
	taxTagSource: "auto" | "rule" | "manual" | null
	/**
	 * A bank/card charge that topped up a connected PayPal account. The purchase itself shows on the
	 * PayPal side under the real merchant, so this one counts as a transfer and never as a payment.
	 */
	fundsPaypal?: boolean
}

/** How PayPal shows up on bank and card statements. */
export const PAYPAL_CHARGE = /paypal|^pp\*/i
