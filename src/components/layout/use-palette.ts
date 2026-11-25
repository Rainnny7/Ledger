import {
  BriefcaseBusiness,
  FileText,
  Landmark,
  LogOut,
  Monitor,
  MonitorPlay,
  Moon,
  Receipt,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sun,
  Timer,
  Wallet,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import {
  ACTIONS,
  GROUP_ORDER,
  PAGES,
  SUGGESTED,
  type PaletteGroup,
  type PaletteItem,
  cachedTransactions,
  merchantItem,
  merchantsOf,
  parseAmount,
  readRecent,
  remember,
  score,
} from "@/components/layout/command-palette-data"
import { signOut, useSession } from "@/lib/auth-client"
import { DEMO_PERSONAS, demoMode, demoPersona, setDemoMode } from "@/lib/demo"
import { THEMES, useAppTheme } from "@/lib/theme"
import { formatMoney, formatShortDate } from "@/lib/format"
import {
  queryClient,
  useGoals,
  useInvoices,
  useOverview,
  useSubscriptions,
  useWork,
} from "@/lib/queries"
export function usePalette({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const { choice, change } = useAppTheme()
  const isAdmin = useSession().data?.user.role === "admin"
  const accounts = useOverview().data?.accounts
  const goals = useGoals().data?.goals
  const subscriptions = useSubscriptions().data?.subscriptions
  const invoices = useInvoices().data?.invoices
  const jobs = useWork().data?.jobs
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const [transactions] = useState(cachedTransactions)
  const merchants = useMemo(() => merchantsOf(transactions), [transactions])
  const [recent] = useState(readRecent)

  // Commands that do something right here rather than going to a page.
  const commands = useMemo<PaletteItem[]>(() => {
    const list: Omit<PaletteItem, "group">[] = [
      ...THEMES.map((t) => ({
        id: `c:theme-${t.id}`,
        label: `${t.label} theme`,
        icon: t.dark ? Moon : Sun,
        run: () => void change(t.id),
        keywords: `appearance mode colour color ${t.dark ? "dark night" : "light day"}`,
      })),
      {
        id: "c:theme-system",
        label: "Match system theme",
        icon: Monitor,
        run: () => void change("system"),
        keywords: "appearance mode auto",
      },
      ...(demoMode
        ? [
            {
              id: "c:demo",
              label: "Exit demo mode",
              icon: MonitorPlay,
              run: () => setDemoMode(false),
              keywords: "sample data example",
            },
          ]
        : []),
      ...DEMO_PERSONAS.filter((p) => !demoMode || p.id !== demoPersona.id).map(
        (p) => ({
          id: `c:demo-${p.id}`,
          label: `${demoMode ? "Switch demo to" : "Try demo as"} ${p.name} (${p.label})`,
          icon: MonitorPlay,
          run: () => setDemoMode(true, p.id),
          keywords: `demo sample data example persona ${p.label} ${p.blurb}`,
        })
      ),
      {
        id: "c:signout",
        label: "Sign out",
        icon: LogOut,
        keywords: "log out logout leave",
        run: async () => {
          await signOut()
          if (demoMode) setDemoMode(false)
          queryClient.clear()
          void navigate("/login", { replace: true })
        },
      },
    ]
    return list
      .filter((c) => c.id !== `c:theme-${choice}`)
      .map((c) => ({ ...c, group: "Actions" as const }))
  }, [choice, change, navigate])

  // Everything findable by name: pages, accounts and the things you've made.
  const pool = useMemo(() => {
    const pages = PAGES.filter((p) => !(demoMode && p.to === "/contacts"))
    if (isAdmin && !demoMode)
      pages.push({
        id: "p:/admin",
        label: "Admin",
        icon: ShieldCheck,
        to: "/admin",
        group: "Pages",
        keywords: "users manage",
      })
    const activeJobs = (jobs ?? []).filter(
      (j) => !j.archived && j.access !== "view"
    )
    const out: PaletteItem[] = [
      ...ACTIONS,
      ...activeJobs.map((j) => ({
        id: `log:${j.id}`,
        label: `Log hours for ${j.name}`,
        icon: Timer,
        group: "Actions" as const,
        keywords: "time shift track work",
        to: `/work?log=${j.id}`,
      })),
      ...commands,
      ...pages,
      ...(accounts ?? []).map((a) => ({
        id: `acct:${a.id}`,
        label: a.name,
        hint: a.numberMasked ?? a.currency,
        icon: Landmark,
        group: "Accounts" as const,
        keywords: `account ${a.type ?? ""}`,
        to: `/accounts/${a.id}`,
      })),
      ...(goals ?? [])
        .filter((g) => !g.archived)
        .map((g) => ({
          id: `goal:${g.id}`,
          label: g.name,
          hint: `${Math.round(g.progress * 100)}% of ${formatMoney(g.target, g.currency)}`,
          icon: Rocket,
          group: "Goals" as const,
          keywords: "goal saving",
          to: `/goals?focus=${g.id}`,
        })),
      ...(subscriptions ?? []).map((s) => ({
        id: `sub:${s.id}`,
        label: s.name,
        hint: `${formatMoney(s.amount, s.currency)} · next ${formatShortDate(s.nextDue)}`,
        icon: RefreshCw,
        group: "Subscriptions" as const,
        keywords: "subscription bill recurring",
        to: `/subscriptions?focus=${s.id}`,
      })),
      ...(invoices ?? []).map((i) => ({
        id: `inv:${i.id}`,
        label: `Invoice ${i.number}${i.client.name ? ` · ${i.client.name}` : ""}`,
        hint:
          i.balance > 0 && i.status !== "draft"
            ? `${formatMoney(i.balance, i.currency)} due`
            : formatMoney(i.total, i.currency),
        icon: FileText,
        group: "Invoices" as const,
        keywords: `invoice ${i.status} ${i.client.email}`,
        to: `/invoices/${i.id}`,
      })),
      ...activeJobs.map((j) => ({
        id: `job:${j.id}`,
        label: j.name,
        hint:
          j.owed > 0 ? `${formatMoney(j.owed, j.currency)} owed` : undefined,
        icon: BriefcaseBusiness,
        group: "Work" as const,
        keywords: "job work client",
        to: "/work",
      })),
    ]
    return out
  }, [accounts, goals, subscriptions, invoices, jobs, commands, isAdmin])

  const items = useMemo(() => {
    const raw = query.trim()
    // ">" narrows to actions, like in an editor.
    const actionsOnly = raw.startsWith(">")
    const text = actionsOnly ? raw.slice(1).trim() : raw
    const words = text.toLowerCase().split(/\s+/).filter(Boolean)
    const searchable = actionsOnly
      ? pool.filter((i) => i.group === "Actions")
      : pool

    if (!words.length) {
      if (actionsOnly) return searchable
      const byId = new Map(pool.map((i) => [i.id, i]))
      const merchantById = (id: string) => {
        const name = id.slice(2)
        const m = merchants.find((x) => x.name === name)
        return m ? merchantItem(m) : undefined
      }
      const recents = recent
        .map(
          (id) =>
            byId.get(id) ?? (id.startsWith("m:") ? merchantById(id) : undefined)
        )
        .filter((i): i is PaletteItem => !!i)
        .map((i) => ({ ...i, group: "Recent" as const }))
      const seen = new Set(recents.map((i) => i.id))
      const suggested = SUGGESTED.filter((id) => !seen.has(id))
        .map((id) => byId.get(id))
        .filter((i): i is PaletteItem => !!i)
        .map((i) => ({ ...i, group: "Suggested" as const }))
      const pages = pool.filter((i) => i.group === "Pages" && !seen.has(i.id))
      const accountItems = pool.filter(
        (i) => i.group === "Accounts" && !seen.has(i.id)
      )
      return [...recents, ...suggested, ...pages, ...accountItems]
    }

    const found = searchable
      .map((item) => ({ item, s: score(item, words) }))
      .filter((x) => x.s >= 0)
      .sort(
        (a, b) =>
          GROUP_ORDER.indexOf(a.item.group) -
            GROUP_ORDER.indexOf(b.item.group) || a.s - b.s
      )
    // Long lists of goals or bills shouldn't push everything else off the screen.
    const perGroup = new Map<PaletteGroup, number>()
    const capped = found
      .filter(({ item }) => {
        const n = (perGroup.get(item.group) ?? 0) + 1
        perGroup.set(item.group, n)
        return item.group === "Actions" || item.group === "Pages" || n <= 5
      })
      .map((x) => x.item)
    if (actionsOnly) return capped

    // Typing an amount finds the transactions for it.
    const amount = parseAmount(text)
    const currencyOf = new Map((accounts ?? []).map((a) => [a.id, a.currency]))
    const txItems: PaletteItem[] = amount
      ? transactions
          .filter((t) => {
            const abs = Math.abs(t.amount)
            return amount.exact
              ? Math.abs(abs - amount.value) < 0.005
              : Math.floor(abs) === amount.value
          })
          .slice(0, 8)
          .map((t) => ({
            id: `tx:${t.id}`,
            label: t.merchant,
            hint: `${formatMoney(t.amount, currencyOf.get(t.accountId))} · ${formatShortDate(t.date)}`,
            icon: t.amount > 0 ? Wallet : Receipt,
            group: "Transactions" as const,
            to: `/transactions?period=all&tx=${t.id}`,
          }))
      : []
    const merchantItems = merchants
      .filter((m) => words.every((w) => m.name.toLowerCase().includes(w)))
      .slice(0, 5)
      .map(merchantItem)
    const search: PaletteItem = {
      id: "search",
      label: `Search transactions for “${text}”`,
      icon: Search,
      group: "Search",
      to: `/transactions?q=${encodeURIComponent(text)}&period=all`,
    }
    return [...txItems, ...capped, ...merchantItems, search]
  }, [query, pool, merchants, transactions, accounts, recent])

  const current = Math.min(active, items.length - 1)

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [current])

  function go(item: PaletteItem | undefined) {
    if (!item) return
    remember(item.id)
    onDone()
    if (item.run) item.run()
    else if (item.to) void navigate(item.to)
  }

  return {
    query,
    setQuery,
    active,
    setActive,
    listRef,
    items,
    current,
    go,
  }
}
