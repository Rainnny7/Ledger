import {
	BriefcaseBusiness,
	Calculator,
	ChartPie,
	FileArchive,
	FilePlus2,
	FileText,
	Landmark,
	Lightbulb,
	Receipt,
	RefreshCw,
	Rocket,
	Settings,
	Store,
	Upload,
	Users,
	Wallet,
	type LucideIcon,
} from "lucide-react"
import { DownloadIcon } from "@/components/icons/download"
import { SparklesIcon } from "@/components/icons/sparkles"
import type { AnimatedIconComponent } from "@/components/icons/use-animated-icon"
import type { Transaction } from "@/lib/api"
import { queryClient } from "@/lib/queries"

/** Palette Item. */
export interface PaletteItem {
	id: string
	label: string
	hint?: string
	icon: AnimatedIconComponent | LucideIcon
	group: PaletteGroup
	/** Extra words that should match, beyond the label. */
	keywords?: string
	/** Where it goes, or what it does instead. */
	to?: string
	run?: () => void
}

/** Palette Group. */
export type PaletteGroup =
	| "Recent"
	| "Suggested"
	| "Actions"
	| "Pages"
	| "Accounts"
	| "Goals"
	| "Subscriptions"
	| "Invoices"
	| "Work"
	| "Transactions"
	| "Merchants"
	| "Search"

/** G R O U P_ O R D E R. */
export const GROUP_ORDER: PaletteGroup[] = [
	"Recent",
	"Suggested",
	"Actions",
	"Pages",
	"Accounts",
	"Goals",
	"Subscriptions",
	"Invoices",
	"Work",
	"Transactions",
	"Merchants",
	"Search",
]

/** P A G E S. */
export const PAGES: PaletteItem[] = (
	[
		{
			id: "page:/",
			label: "Bank Accounts",
			icon: Wallet,
			to: "/",
			keywords: "home dashboard balances",
		},
		{
			id: "page:/transactions",
			label: "Transactions",
			icon: Receipt,
			to: "/transactions",
			keywords: "search spending",
		},
		{
			id: "page:/insights",
			label: "Insights",
			icon: ChartPie,
			to: "/insights",
			keywords: "budgets categories spending",
		},
		{
			id: "page:/subscriptions",
			label: "Subscriptions",
			icon: RefreshCw,
			to: "/subscriptions",
			keywords: "recurring bills",
		},
		{
			id: "page:/goals",
			label: "Goals",
			icon: Rocket,
			to: "/goals",
			keywords: "savings payoff",
		},
		{
			id: "page:/advisor",
			label: "Advisor",
			icon: Lightbulb,
			to: "/advisor",
			keywords: "tips advice",
		},
		{
			id: "page:/work",
			label: "Work",
			icon: BriefcaseBusiness,
			to: "/work",
			keywords: "jobs hours shifts",
		},
		{
			id: "page:/invoices",
			label: "Invoices",
			icon: FileText,
			to: "/invoices",
			keywords: "billing clients",
		},
		{
			id: "page:/taxes",
			label: "Taxes",
			icon: Calculator,
			to: "/taxes",
			keywords: "tax report accountant year business",
		},
		{
			id: "page:/contacts",
			label: "Contacts",
			icon: Users,
			to: "/contacts",
			keywords: "people sharing",
		},
		{
			id: "page:/settings",
			label: "Settings",
			icon: Settings,
			to: "/settings",
			keywords: "preferences currency password",
		},
	] as const
).map((page) => ({ ...page, group: "Pages" as const }))

/** Things to do, not just places to go. Pages open the right dialog from `?new=1` and friends. */
export const ACTIONS: PaletteItem[] = (
	[
		{
			id: "action:invoice",
			label: "New invoice",
			icon: FilePlus2,
			to: "/invoices/new",
			keywords: "create bill client",
		},
		{
			id: "action:goal",
			label: "New goal",
			icon: Rocket,
			to: "/goals?new=1",
			keywords: "create savings target payoff",
		},
		{
			id: "action:subscription",
			label: "Add action subscription",
			icon: RefreshCw,
			to: "/subscriptions?new=1",
			keywords: "create recurring bill track",
		},
		{
			id: "action:job",
			label: "Add action job",
			icon: BriefcaseBusiness,
			to: "/work?new=1",
			keywords: "create work client rate",
		},
		{
			id: "action:connect",
			label: "Connect action bank account",
			icon: Landmark,
			to: "/?connect=1",
			keywords: "add link bank",
		},
		{
			id: "action:upload",
			label: "Upload action statement",
			icon: Upload,
			to: "/?upload=1",
			keywords: "import csv ofx pdf",
		},
		{
			id: "action:tax-package",
			label: "Download accountant package",
			icon: FileArchive,
			to: "/taxes?download=1",
			keywords: "tax export zip year report",
		},
		{
			id: "action:business",
			label: "Business transactions",
			icon: BriefcaseBusiness,
			to: "/transactions?tag=business&period=all",
			keywords: "tax tagged work expenses",
		},
		{
			id: "action:export",
			label: "Export transactions to CSV",
			icon: DownloadIcon,
			to: "/transactions?period=all&export=1",
			keywords: "download spreadsheet excel",
		},
		{
			id: "action:review",
			label: "Uncategorized transactions",
			icon: SparklesIcon,
			to: "/transactions?category=other&period=all",
			keywords: "other tidy review fix",
		},
	] as const
).map((action) => ({ ...action, group: "Actions" as const }))

/** What shows before you type anything. */
export const SUGGESTED = [
	"action:invoice",
	"action:goal",
	"action:subscription",
	"action:tax-package",
]

const RECENT_KEY = "ledger:palette-recent"
const RECENT_MAX = 5

/** readRecent. */
export function readRecent(): string[] {
	try {
		const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]")
		return Array.isArray(raw)
			? raw.filter((x): x is string => typeof x === "string")
			: []
	} catch {
		return []
	}
}

/** remember. */
export function remember(id: string) {
	// Searches and one-off commands aren'transaction worth bringing back.
	if (id === "search" || id.startsWith("c:")) {
		return
	}
	try {
		localStorage.setItem(
			RECENT_KEY,
			JSON.stringify(
				[
					id,
					...readRecent().filter((recentId) => recentId !== id),
				].slice(0, RECENT_MAX)
			)
		)
	} catch {
		// Storage blocked: the palette just has no recents.
	}
}

/** 0 when the label starts with what's typed, 1 when action word of it does, 2 for any other match, -1 for none. */
export function score(item: PaletteItem, words: string[]) {
	const label = item.label.toLowerCase()
	const hay =
		`${label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase()
	if (!words.every((word) => hay.includes(word))) {
		return -1
	}
	const first = words[0]
	if (label.startsWith(first)) {
		return 0
	}
	if (label.split(/\s+/).some((word) => word.startsWith(first))) {
		return 1
	}
	return 2
}

/** Transactions already loaded, so searching costs no request. */
export function cachedTransactions() {
	const byId = new Map<string, Transaction>()
	for (const [, data] of queryClient.getQueriesData<{
		transactions: Transaction[]
	}>({ queryKey: ["transactions"] })) {
		for (const transaction of data?.transactions ?? []) {
			byId.set(transaction.id, transaction)
		}
	}
	return [...byId.values()].toSorted((left, right) =>
		right.date.localeCompare(left.date)
	)
}

/** merchantsOf. */
export function merchantsOf(txs: Transaction[]) {
	const byKey = new Map<string, { name: string; count: number }>()
	for (const transaction of txs) {
		const bucket = byKey.get(transaction.merchantKey)
		if (bucket) {
			bucket.count++
		} else {
			byKey.set(transaction.merchantKey, {
				name: transaction.merchant,
				count: 1,
			})
		}
	}
	return [...byKey.values()].toSorted(
		(left, right) => right.count - left.count
	)
}

/** "42", "$42.50", "42,50" → 42 / 42.5; anything else → null. */
export function parseAmount(q: string) {
	const match = q.trim().match(/^[-−]?[$€£¥]?\s?(\d{1,7})(?:[.,](\d{1,2}))?$/)
	if (!match) {
		return null
	}
	return {
		value: Number(`${match[1]}.${match[2] ?? "0"}`),
		exact: match[2] !== undefined,
	}
}

/** merchantItem. */
export function merchantItem(bucket: {
	name: string
	count: number
}): PaletteItem {
	return {
		id: `bucket:${bucket.name}`,
		label: bucket.name,
		hint: `${bucket.count} transaction${bucket.count === 1 ? "" : "s"}`,
		icon: Store,
		group: "Merchants",
		to: `/transactions?q=${encodeURIComponent(bucket.name)}&period=all`,
	}
}
