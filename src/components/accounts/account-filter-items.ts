import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"

export const accountPeriodItems = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
  { value: "all", label: "All time" },
] as const

export const accountCategoryItems = [
  { value: "all", label: "All categories" },
  ...CATEGORY_LIST.map((c) => ({ value: c, label: CATEGORY_META[c].label })),
]
