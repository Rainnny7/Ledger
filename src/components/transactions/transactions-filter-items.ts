import {
  CATEGORY_LIST,
  CATEGORY_META,
  TAX_TAG_LIST,
  TAX_TAG_META,
} from "@/lib/categories"
import type { Category, TaxTag } from "@/lib/api"
import type { RangeKey } from "@/lib/ranges"

export type Flow = "all" | "in" | "out"
export type TagFilter = "all" | TaxTag | "untagged"

export const TRANSACTIONS_PAGE = 100

export const transactionPeriodItems: { value: RangeKey; label: string }[] = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "6m", label: "Last 6 months" },
  { value: "1y", label: "Last year" },
  { value: "all", label: "All time" },
]

export const transactionCategoryItems = [
  { value: "all", label: "All categories" },
  ...CATEGORY_LIST.map((c) => ({ value: c, label: CATEGORY_META[c].label })),
]

export const transactionTagItems: { value: TagFilter; label: string }[] = [
  { value: "all", label: "Any tax tag" },
  ...TAX_TAG_LIST.map((t) => ({ value: t, label: TAX_TAG_META[t].label })),
  { value: "untagged", label: "Untagged" },
]

export const transactionRetagItems = [
  ...TAX_TAG_LIST.map((t) => ({ value: t, label: TAX_TAG_META[t].label })),
  { value: "none", label: "Remove tag" },
]

export const transactionRecategorizeItems = [
  { value: "auto", label: "Automatic" },
  ...CATEGORY_LIST.map((c) => ({
    value: c,
    label: CATEGORY_META[c as Category].label,
  })),
]
