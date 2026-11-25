import {
  BriefcaseBusiness,
  Calculator,
  ChartPie,
  Download,
  FileArchive,
  FilePlus2,
  FileText,
  Landmark,
  Lightbulb,
  Receipt,
  RefreshCw,
  Rocket,
  Settings,
  Sparkles,
  Store,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import type { Transaction } from "@/lib/api"
import { queryClient } from "@/lib/queries"

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  group: PaletteGroup
  /** Extra words that should match, beyond the label. */
  keywords?: string
  /** Where it goes, or what it does instead. */
  to?: string
  run?: () => void
}

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

export const PAGES: PaletteItem[] = (
  [
    {
      id: "p:/",
      label: "Bank Accounts",
      icon: Wallet,
      to: "/",
      keywords: "home dashboard balances",
    },
    {
      id: "p:/transactions",
      label: "Transactions",
      icon: Receipt,
      to: "/transactions",
      keywords: "search spending",
    },
    {
      id: "p:/insights",
      label: "Insights",
      icon: ChartPie,
      to: "/insights",
      keywords: "budgets categories spending",
    },
    {
      id: "p:/subscriptions",
      label: "Subscriptions",
      icon: RefreshCw,
      to: "/subscriptions",
      keywords: "recurring bills",
    },
    {
      id: "p:/goals",
      label: "Goals",
      icon: Rocket,
      to: "/goals",
      keywords: "savings payoff",
    },
    {
      id: "p:/advisor",
      label: "Advisor",
      icon: Lightbulb,
      to: "/advisor",
      keywords: "tips advice",
    },
    {
      id: "p:/work",
      label: "Work",
      icon: BriefcaseBusiness,
      to: "/work",
      keywords: "jobs hours shifts",
    },
    {
      id: "p:/invoices",
      label: "Invoices",
      icon: FileText,
      to: "/invoices",
      keywords: "billing clients",
    },
    {
      id: "p:/taxes",
      label: "Taxes",
      icon: Calculator,
      to: "/taxes",
      keywords: "tax report accountant year business",
    },
    {
      id: "p:/contacts",
      label: "Contacts",
      icon: Users,
      to: "/contacts",
      keywords: "people sharing",
    },
    {
      id: "p:/settings",
      label: "Settings",
      icon: Settings,
      to: "/settings",
      keywords: "preferences currency password",
    },
  ] as const
).map((p) => ({ ...p, group: "Pages" as const }))

/** Things to do, not just places to go. Pages open the right dialog from `?new=1` and friends. */
export const ACTIONS: PaletteItem[] = (
  [
    {
      id: "a:invoice",
      label: "New invoice",
      icon: FilePlus2,
      to: "/invoices/new",
      keywords: "create bill client",
    },
    {
      id: "a:goal",
      label: "New goal",
      icon: Rocket,
      to: "/goals?new=1",
      keywords: "create savings target payoff",
    },
    {
      id: "a:subscription",
      label: "Add a subscription",
      icon: RefreshCw,
      to: "/subscriptions?new=1",
      keywords: "create recurring bill track",
    },
    {
      id: "a:job",
      label: "Add a job",
      icon: BriefcaseBusiness,
      to: "/work?new=1",
      keywords: "create work client rate",
    },
    {
      id: "a:connect",
      label: "Connect a bank account",
      icon: Landmark,
      to: "/?connect=1",
      keywords: "add link bank",
    },
    {
      id: "a:upload",
      label: "Upload a statement",
      icon: Upload,
      to: "/?upload=1",
      keywords: "import csv ofx pdf",
    },
    {
      id: "a:tax-package",
      label: "Download accountant package",
      icon: FileArchive,
      to: "/taxes?download=1",
      keywords: "tax export zip year report",
    },
    {
      id: "a:business",
      label: "Business transactions",
      icon: BriefcaseBusiness,
      to: "/transactions?tag=business&period=all",
      keywords: "tax tagged work expenses",
    },
    {
      id: "a:export",
      label: "Export transactions to CSV",
      icon: Download,
      to: "/transactions?period=all&export=1",
      keywords: "download spreadsheet excel",
    },
    {
      id: "a:review",
      label: "Uncategorized transactions",
      icon: Sparkles,
      to: "/transactions?category=other&period=all",
      keywords: "other tidy review fix",
    },
  ] as const
).map((a) => ({ ...a, group: "Actions" as const }))

/** What shows before you type anything. */
export const SUGGESTED = [
  "a:invoice",
  "a:goal",
  "a:subscription",
  "a:tax-package",
]

const RECENT_KEY = "ledger:palette-recent"
const RECENT_MAX = 5

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

export function remember(id: string) {
  // Searches and one-off commands aren't worth bringing back.
  if (id === "search" || id.startsWith("c:")) return
  try {
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(
        [id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX)
      )
    )
  } catch {
    // Storage blocked: the palette just has no recents.
  }
}

/** 0 when the label starts with what's typed, 1 when a word of it does, 2 for any other match, -1 for none. */
export function score(item: PaletteItem, words: string[]) {
  const label = item.label.toLowerCase()
  const hay = `${label} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase()
  if (!words.every((w) => hay.includes(w))) return -1
  const first = words[0]
  if (label.startsWith(first)) return 0
  if (label.split(/\s+/).some((w) => w.startsWith(first))) return 1
  return 2
}

/** Transactions already loaded, so searching costs no request. */
export function cachedTransactions() {
  const byId = new Map<string, Transaction>()
  for (const [, data] of queryClient.getQueriesData<{
    transactions: Transaction[]
  }>({ queryKey: ["transactions"] })) {
    for (const t of data?.transactions ?? []) byId.set(t.id, t)
  }
  return [...byId.values()].toSorted((a, b) => b.date.localeCompare(a.date))
}

export function merchantsOf(txs: Transaction[]) {
  const byKey = new Map<string, { name: string; count: number }>()
  for (const t of txs) {
    const m = byKey.get(t.merchantKey)
    if (m) m.count++
    else byKey.set(t.merchantKey, { name: t.merchant, count: 1 })
  }
  return [...byKey.values()].toSorted((a, b) => b.count - a.count)
}

/** "42", "$42.50", "42,50" → 42 / 42.5; anything else → null. */
export function parseAmount(q: string) {
  const m = q.trim().match(/^[-−]?[$€£¥]?\s?(\d{1,7})(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  return { value: Number(`${m[1]}.${m[2] ?? "0"}`), exact: m[2] !== undefined }
}

export function merchantItem(m: { name: string; count: number }): PaletteItem {
  return {
    id: `m:${m.name}`,
    label: m.name,
    hint: `${m.count} transaction${m.count === 1 ? "" : "s"}`,
    icon: Store,
    group: "Merchants",
    to: `/transactions?q=${encodeURIComponent(m.name)}&period=all`,
  }
}
