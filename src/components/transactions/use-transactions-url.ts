import {
	type Flow,
	type TagFilter,
} from "@/components/transactions/transactions-filter-items"
import { RANGES, type RangeKey } from "@/lib/ranges"
import type { Category } from "@/lib/api"
import { CATEGORY_LIST, TAX_TAG_LIST } from "@/lib/categories"
import { URL_OPTIONS, useUrlState } from "@/lib/url-state"
import { parseAsString, useQueryStates } from "nuqs"
import { useMemo } from "react"

/** React/UI entry: `useTransactionsUrl`. */
export function useTransactionsUrl() {
	const [query, setQuery] = useUrlState<string>("q", "")
	const [accountId, setAccountId] = useUrlState<string>("account", "all")
	const [category, setCategory] = useUrlState<Category | "all">(
		"category",
		"all",
		["all", ...CATEGORY_LIST]
	)
	const [flow, setFlow] = useUrlState<Flow>("flow", "all", [
		"all",
		"in",
		"out",
	])
	const [period, setPeriod] = useUrlState<RangeKey>(
		"period",
		"90d",
		Object.keys(RANGES) as RangeKey[]
	)
	const [tag, setTag] = useUrlState<TagFilter>("tag", "all", [
		"all",
		...TAX_TAG_LIST,
		"untagged",
	])
	const [links, setLinks] = useQueryStates(
		{
			merchants: parseAsString.withDefault(""),
			from: parseAsString,
			to: parseAsString,
		},
		URL_OPTIONS
	)
	const merchantKeys = useMemo(
		() => new Set(links.merchants.split(",").filter(Boolean)),
		[links.merchants]
	)
	const sinceParam = links.from
	const since =
		sinceParam && /^\d{4}-\d{2}-\d{2}$/.test(sinceParam) ? sinceParam : null
	const untilParam = links.to
	const until =
		since && untilParam && /^\d{4}-\d{2}-\d{2}$/.test(untilParam)
			? untilParam
			: null

	return {
		query,
		setQuery,
		accountId,
		setAccountId,
		category,
		setCategory,
		flow,
		setFlow,
		period,
		setPeriod,
		tag,
		setTag,
		links,
		setLinks,
		merchantKeys,
		since,
		until,
	}
}
