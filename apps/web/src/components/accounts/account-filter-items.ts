import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"

/** `accountPeriodItems` helper or constant for this feature area. */
export const accountPeriodItems = [
	{ value: "30d", label: "Last 30 days" },
	{ value: "90d", label: "Last 90 days" },
	{ value: "6m", label: "Last 6 months" },
	{ value: "1y", label: "Last year" },
	{ value: "2y", label: "Last 2 years" },
	{ value: "3y", label: "Last 3 years" },
	{ value: "4y", label: "Last 4 years" },
	{ value: "all", label: "All time" },
] as const

/** `accountCategoryItems` helper or constant for this feature area. */
export const accountCategoryItems = [
	{ value: "all", label: "All categories" },
	...CATEGORY_LIST.map((category) => ({
		value: category,
		label: CATEGORY_META[category].label,
	})),
]
