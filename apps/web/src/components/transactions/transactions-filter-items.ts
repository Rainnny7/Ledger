import {
	CATEGORY_LIST,
	CATEGORY_META,
	TAX_TAG_LIST,
	TAX_TAG_META,
} from "@/lib/categories"
import type { Category, TaxTag } from "@/lib/api"
import type { RangeKey } from "@/lib/ranges"

/** Shape for `Flow` used across this module. */
export type Flow = "all" | "in" | "out"
/** Shape for `TagFilter` used across this module. */
export type TagFilter = "all" | TaxTag | "untagged"

/** `transactionPeriodItems:` helper or constant for this feature area. */
export const transactionPeriodItems: { value: RangeKey; label: string }[] = [
	{ value: "30d", label: "Last 30 days" },
	{ value: "90d", label: "Last 90 days" },
	{ value: "6m", label: "Last 6 months" },
	{ value: "1y", label: "Last year" },
	{ value: "2y", label: "Last 2 years" },
	{ value: "3y", label: "Last 3 years" },
	{ value: "4y", label: "Last 4 years" },
	{ value: "all", label: "All time" },
]

/** `transactionCategoryItems` helper or constant for this feature area. */
export const transactionCategoryItems = [
	{ value: "all", label: "All categories" },
	...CATEGORY_LIST.map((category) => ({
		value: category,
		label: CATEGORY_META[category].label,
	})),
]

/** `transactionTagItems:` helper or constant for this feature area. */
export const transactionTagItems: { value: TagFilter; label: string }[] = [
	{ value: "all", label: "Any tax tag" },
	...TAX_TAG_LIST.map((taxTag) => ({
		value: taxTag,
		label: TAX_TAG_META[taxTag].label,
	})),
	{ value: "untagged", label: "Untagged" },
]

/** `transactionRetagItems` helper or constant for this feature area. */
export const transactionRetagItems = [
	...TAX_TAG_LIST.map((taxTag) => ({
		value: taxTag,
		label: TAX_TAG_META[taxTag].label,
	})),
	{ value: "none", label: "Remove tag" },
]

/** `transactionRecategorizeItems` helper or constant for this feature area. */
export const transactionRecategorizeItems = [
	{ value: "auto", label: "Automatic" },
	...CATEGORY_LIST.map((category) => ({
		value: category,
		label: CATEGORY_META[category as Category].label,
	})),
]
