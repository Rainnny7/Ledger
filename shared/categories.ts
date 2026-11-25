/** Spending categories and billing periods, used by both the server and the app so they can't drift apart. */

export const CATEGORIES = [
	"income",
	"transfers",
	"food",
	"groceries",
	"transport",
	"shopping",
	"subscriptions",
	"bills",
	"entertainment",
	"health",
	"fees",
	"debt",
	"cash",
	"other",
] as const
/** Allowed spending category slug. */
export type Category = (typeof CATEGORIES)[number]

/** Whether `value` is a known spending category slug. */
export function isCategory(value: unknown): value is Category {
	return (
		typeof value === "string" &&
		(CATEGORIES as readonly string[]).includes(value)
	)
}

/** How a transaction counts for taxes: part of running a business (side work, self-employment) or personal. */
export const TAX_TAGS = ["business", "personal"] as const
/** Business vs personal tax treatment tag. */
export type TaxTag = (typeof TAX_TAGS)[number]

/** Whether `value` is a valid business/personal tax tag. */
export function isTaxTag(value: unknown): value is TaxTag {
	return (
		typeof value === "string" &&
		(TAX_TAGS as readonly string[]).includes(value)
	)
}

/** Named billing periods. Anything else is stored as "every-<n>-<weeks|months|years>". */
export const PRESET_CYCLES = [
	"weekly",
	"biweekly",
	"monthly",
	"quarterly",
	"semiannual",
	"yearly",
	"biennial",
	"triennial",
] as const
/** Named billing period before custom `every-N-unit` cycles. */
export type PresetCycle = (typeof PRESET_CYCLES)[number]
/** Unit for custom billing cycles. */
export type CycleUnit = "weeks" | "months" | "years"
/** A preset billing period, or a custom one like `every-5-years`. */
export type Cycle = PresetCycle | `every-${number}-${CycleUnit}`
