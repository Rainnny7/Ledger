import {
  ArrowRight,
  BriefcaseBusiness,
  Calculator,
  ChartPie,
  Clock,
  CornerDownLeft,
  Download,
  FileArchive,
  FilePlus2,
  FileText,
  Landmark,
  Lightbulb,
  LogOut,
  Monitor,
  MonitorPlay,
  Moon,
  Plus,
  Receipt,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  Timer,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Transaction } from '@/lib/api'
import { signOut, useSession } from '@/lib/auth-client'
import { demoMode, setDemoMode } from '@/lib/demo'
import { THEMES, useAppTheme } from '@/lib/theme'
import { formatMoney, formatShortDate } from '@/lib/format'
import { queryClient, useGoals, useInvoices, useOverview, useSubscriptions, useWork } from '@/lib/queries'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  group: Group
  /** Extra words that should match, beyond the label. */
  keywords?: string
  /** Where it goes, or what it does instead. */
  to?: string
  run?: () => void
}

type Group =
  | 'Recent'
  | 'Suggested'
  | 'Actions'
  | 'Pages'
  | 'Accounts'
  | 'Goals'
  | 'Subscriptions'
  | 'Invoices'
  | 'Work'
  | 'Transactions'
  | 'Merchants'
  | 'Search'

const GROUP_ORDER: Group[] = ['Recent', 'Suggested', 'Actions', 'Pages', 'Accounts', 'Goals', 'Subscriptions', 'Invoices', 'Work', 'Transactions', 'Merchants', 'Search']

const PAGES: Item[] = (
  [
    { id: 'p:/', label: 'Bank Accounts', icon: Wallet, to: '/', keywords: 'home dashboard balances' },
    { id: 'p:/transactions', label: 'Transactions', icon: Receipt, to: '/transactions', keywords: 'search spending' },
    { id: 'p:/insights', label: 'Insights', icon: ChartPie, to: '/insights', keywords: 'budgets categories spending' },
    { id: 'p:/subscriptions', label: 'Subscriptions', icon: RefreshCw, to: '/subscriptions', keywords: 'recurring bills' },
    { id: 'p:/goals', label: 'Goals', icon: Rocket, to: '/goals', keywords: 'savings payoff' },
    { id: 'p:/advisor', label: 'Advisor', icon: Lightbulb, to: '/advisor', keywords: 'tips advice' },
    { id: 'p:/work', label: 'Work', icon: BriefcaseBusiness, to: '/work', keywords: 'jobs hours shifts' },
    { id: 'p:/invoices', label: 'Invoices', icon: FileText, to: '/invoices', keywords: 'billing clients' },
    { id: 'p:/taxes', label: 'Taxes', icon: Calculator, to: '/taxes', keywords: 'tax report accountant year business' },
    { id: 'p:/contacts', label: 'Contacts', icon: Users, to: '/contacts', keywords: 'people sharing' },
    { id: 'p:/settings', label: 'Settings', icon: Settings, to: '/settings', keywords: 'preferences currency password' },
  ] as const
).map((p) => ({ ...p, group: 'Pages' as const }))

/** Things to do, not just places to go. Pages open the right dialog from `?new=1` and friends. */
const ACTIONS: Item[] = (
  [
    { id: 'a:invoice', label: 'New invoice', icon: FilePlus2, to: '/invoices/new', keywords: 'create bill client' },
    { id: 'a:goal', label: 'New goal', icon: Rocket, to: '/goals?new=1', keywords: 'create savings target payoff' },
    { id: 'a:subscription', label: 'Add a subscription', icon: RefreshCw, to: '/subscriptions?new=1', keywords: 'create recurring bill track' },
    { id: 'a:job', label: 'Add a job', icon: BriefcaseBusiness, to: '/work?new=1', keywords: 'create work client rate' },
    { id: 'a:connect', label: 'Connect a bank account', icon: Landmark, to: '/?connect=1', keywords: 'add link bank' },
    { id: 'a:upload', label: 'Upload a statement', icon: Upload, to: '/?upload=1', keywords: 'import csv ofx pdf' },
    { id: 'a:tax-package', label: 'Download accountant package', icon: FileArchive, to: '/taxes?download=1', keywords: 'tax export zip year report' },
    { id: 'a:business', label: 'Business transactions', icon: BriefcaseBusiness, to: '/transactions?tag=business&period=all', keywords: 'tax tagged work expenses' },
    { id: 'a:export', label: 'Export transactions to CSV', icon: Download, to: '/transactions?period=all&export=1', keywords: 'download spreadsheet excel' },
    { id: 'a:review', label: 'Uncategorized transactions', icon: Sparkles, to: '/transactions?category=other&period=all', keywords: 'other tidy review fix' },
  ] as const
).map((a) => ({ ...a, group: 'Actions' as const }))

/** What shows before you type anything. */
const SUGGESTED = ['a:invoice', 'a:goal', 'a:subscription', 'a:tax-package']

const RECENT_KEY = 'ledger:palette-recent'
const RECENT_MAX = 5

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function remember(id: string) {
  // Searches and one-off commands aren't worth bringing back.
  if (id === 'search' || id.startsWith('c:')) return
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX)))
  } catch {
    // Storage blocked: the palette just has no recents.
  }
}

/** 0 when the label starts with what's typed, 1 when a word of it does, 2 for any other match, -1 for none. */
function score(item: Item, words: string[]) {
  const label = item.label.toLowerCase()
  const hay = `${label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase()
  if (!words.every((w) => hay.includes(w))) return -1
  const first = words[0]
  if (label.startsWith(first)) return 0
  if (label.split(/\s+/).some((w) => w.startsWith(first))) return 1
  return 2
}

/** Transactions already loaded, so searching costs no request. */
function cachedTransactions() {
  const byId = new Map<string, Transaction>()
  for (const [, data] of queryClient.getQueriesData<{ transactions: Transaction[] }>({ queryKey: ['transactions'] })) {
    for (const t of data?.transactions ?? []) byId.set(t.id, t)
  }
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function merchantsOf(txs: Transaction[]) {
  const byKey = new Map<string, { name: string; count: number }>()
  for (const t of txs) {
    const m = byKey.get(t.merchantKey)
    if (m) m.count++
    else byKey.set(t.merchantKey, { name: t.merchant, count: 1 })
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count)
}

/** "42", "$42.50", "42,50" → 42 / 42.5; anything else → null. */
function parseAmount(q: string) {
  const m = q.trim().match(/^[-−]?[$€£¥]?\s?(\d{1,7})(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  return { value: Number(`${m[1]}.${m[2] ?? '0'}`), exact: m[2] !== undefined }
}

/** ⌘K / Ctrl+K: jump anywhere, find anything, or do the common things without hunting for the button. */
export function CommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 ring-primary/25 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Command menu</DialogTitle>
        <DialogDescription className="sr-only">Search pages, accounts, goals, bills, invoices and transactions, or run an action</DialogDescription>
        {open && <Palette onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

const OPEN_EVENT = 'ledger:open-palette'
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT))

function Palette({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const { choice, change } = useAppTheme()
  const isAdmin = useSession().data?.user.role === 'admin'
  const accounts = useOverview().data?.accounts
  const goals = useGoals().data?.goals
  const subscriptions = useSubscriptions().data?.subscriptions
  const invoices = useInvoices().data?.invoices
  const jobs = useWork().data?.jobs
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const [transactions] = useState(cachedTransactions)
  const merchants = useMemo(() => merchantsOf(transactions), [transactions])
  const [recent] = useState(readRecent)

  // Commands that do something right here rather than going to a page.
  const commands = useMemo<Item[]>(() => {
    const list: Omit<Item, 'group'>[] = [
      ...THEMES.map((t) => ({
        id: `c:theme-${t.id}`,
        label: `${t.label} theme`,
        icon: t.dark ? Moon : Sun,
        run: () => void change(t.id),
        keywords: `appearance mode colour color ${t.dark ? 'dark night' : 'light day'}`,
      })),
      { id: 'c:theme-system', label: 'Match system theme', icon: Monitor, run: () => void change('system'), keywords: 'appearance mode auto' },
      {
        id: 'c:demo',
        label: demoMode ? 'Exit demo mode' : 'Try demo mode',
        icon: MonitorPlay,
        run: () => setDemoMode(!demoMode),
        keywords: 'sample data example',
      },
      {
        id: 'c:signout',
        label: 'Sign out',
        icon: LogOut,
        keywords: 'log out logout leave',
        run: async () => {
          await signOut()
          if (demoMode) setDemoMode(false)
          queryClient.clear()
          void navigate('/login', { replace: true })
        },
      },
    ]
    return list
      .filter((c) => c.id !== `c:theme-${choice}`)
      .map((c) => ({ ...c, group: 'Actions' as const }))
  }, [choice, change, navigate])

  // Everything findable by name: pages, accounts and the things you've made.
  const pool = useMemo(() => {
    const pages = PAGES.filter((p) => !(demoMode && p.to === '/contacts'))
    if (isAdmin && !demoMode) pages.push({ id: 'p:/admin', label: 'Admin', icon: ShieldCheck, to: '/admin', group: 'Pages', keywords: 'users manage' })
    const activeJobs = (jobs ?? []).filter((j) => !j.archived && j.access !== 'view')
    const out: Item[] = [
      ...ACTIONS,
      ...activeJobs.map((j) => ({
        id: `log:${j.id}`,
        label: `Log hours for ${j.name}`,
        icon: Timer,
        group: 'Actions' as const,
        keywords: 'time shift track work',
        to: `/work?log=${j.id}`,
      })),
      ...commands,
      ...pages,
      ...(accounts ?? []).map((a) => ({
        id: `acct:${a.id}`,
        label: a.name,
        hint: a.numberMasked ?? a.currency,
        icon: Landmark,
        group: 'Accounts' as const,
        keywords: `account ${a.type ?? ''}`,
        to: `/accounts/${a.id}`,
      })),
      ...(goals ?? [])
        .filter((g) => !g.archived)
        .map((g) => ({
          id: `goal:${g.id}`,
          label: g.name,
          hint: `${Math.round(g.progress * 100)}% of ${formatMoney(g.target, g.currency)}`,
          icon: Rocket,
          group: 'Goals' as const,
          keywords: 'goal saving',
          to: `/goals?focus=${g.id}`,
        })),
      ...(subscriptions ?? []).map((s) => ({
        id: `sub:${s.id}`,
        label: s.name,
        hint: `${formatMoney(s.amount, s.currency)} · next ${formatShortDate(s.nextDue)}`,
        icon: RefreshCw,
        group: 'Subscriptions' as const,
        keywords: 'subscription bill recurring',
        to: `/subscriptions?focus=${s.id}`,
      })),
      ...(invoices ?? []).map((i) => ({
        id: `inv:${i.id}`,
        label: `Invoice ${i.number}${i.client.name ? ` · ${i.client.name}` : ''}`,
        hint: i.balance > 0 && i.status !== 'draft' ? `${formatMoney(i.balance, i.currency)} due` : formatMoney(i.total, i.currency),
        icon: FileText,
        group: 'Invoices' as const,
        keywords: `invoice ${i.status} ${i.client.email}`,
        to: `/invoices/${i.id}`,
      })),
      ...activeJobs.map((j) => ({
        id: `job:${j.id}`,
        label: j.name,
        hint: j.owed > 0 ? `${formatMoney(j.owed, j.currency)} owed` : undefined,
        icon: BriefcaseBusiness,
        group: 'Work' as const,
        keywords: 'job work client',
        to: '/work',
      })),
    ]
    return out
  }, [accounts, goals, subscriptions, invoices, jobs, commands, isAdmin])

  const items = useMemo(() => {
    const raw = query.trim()
    // ">" narrows to actions, like in an editor.
    const actionsOnly = raw.startsWith('>')
    const text = actionsOnly ? raw.slice(1).trim() : raw
    const words = text.toLowerCase().split(/\s+/).filter(Boolean)
    const searchable = actionsOnly ? pool.filter((i) => i.group === 'Actions') : pool

    if (!words.length) {
      if (actionsOnly) return searchable
      const byId = new Map(pool.map((i) => [i.id, i]))
      const merchantById = (id: string) => {
        const name = id.slice(2)
        const m = merchants.find((x) => x.name === name)
        return m ? merchantItem(m) : undefined
      }
      const recents = recent
        .map((id) => byId.get(id) ?? (id.startsWith('m:') ? merchantById(id) : undefined))
        .filter((i): i is Item => !!i)
        .map((i) => ({ ...i, group: 'Recent' as const }))
      const seen = new Set(recents.map((i) => i.id))
      const suggested = SUGGESTED.filter((id) => !seen.has(id))
        .map((id) => byId.get(id))
        .filter((i): i is Item => !!i)
        .map((i) => ({ ...i, group: 'Suggested' as const }))
      const pages = pool.filter((i) => i.group === 'Pages' && !seen.has(i.id))
      const accountItems = pool.filter((i) => i.group === 'Accounts' && !seen.has(i.id))
      return [...recents, ...suggested, ...pages, ...accountItems]
    }

    const found = searchable
      .map((item) => ({ item, s: score(item, words) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group) || a.s - b.s)
    // Long lists of goals or bills shouldn't push everything else off the screen.
    const perGroup = new Map<Group, number>()
    const capped = found
      .filter(({ item }) => {
        const n = (perGroup.get(item.group) ?? 0) + 1
        perGroup.set(item.group, n)
        return item.group === 'Actions' || item.group === 'Pages' || n <= 5
      })
      .map((x) => x.item)
    if (actionsOnly) return capped

    // Typing an amount finds the transactions for it.
    const amount = parseAmount(text)
    const currencyOf = new Map((accounts ?? []).map((a) => [a.id, a.currency]))
    const txItems: Item[] = amount
      ? transactions
          .filter((t) => {
            const abs = Math.abs(t.amount)
            return amount.exact ? Math.abs(abs - amount.value) < 0.005 : Math.floor(abs) === amount.value
          })
          .slice(0, 8)
          .map((t) => ({
            id: `tx:${t.id}`,
            label: t.merchant,
            hint: `${formatMoney(t.amount, currencyOf.get(t.accountId))} · ${formatShortDate(t.date)}`,
            icon: t.amount > 0 ? Wallet : Receipt,
            group: 'Transactions' as const,
            to: `/transactions?period=all&tx=${t.id}`,
          }))
      : []
    const merchantItems = merchants
      .filter((m) => words.every((w) => m.name.toLowerCase().includes(w)))
      .slice(0, 5)
      .map(merchantItem)
    const search: Item = {
      id: 'search',
      label: `Search transactions for “${text}”`,
      icon: Search,
      group: 'Search',
      to: `/transactions?q=${encodeURIComponent(text)}&period=all`,
    }
    return [...txItems, ...capped, ...merchantItems, search]
  }, [query, pool, merchants, transactions, accounts, recent])

  const current = Math.min(active, items.length - 1)

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  function go(item: Item | undefined) {
    if (!item) return
    remember(item.id)
    onDone()
    if (item.run) item.run()
    else if (item.to) void navigate(item.to)
  }

  return (
    <div className="flex max-h-[min(34rem,70svh)] flex-col">
      <div className="flex items-center gap-2.5 border-b px-3.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Search className="size-4" />
        </span>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (!items.length) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((current + 1) % items.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((current - 1 + items.length) % items.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              go(items[current])
            }
          }}
          placeholder="Search, type an amount, or > for actions…"
          aria-label="Search"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={items[current] ? `palette-${current}` : undefined}
          className="h-13 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
      </div>
      <div ref={listRef} id="palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">No actions match.</p>}
        {items.map((item, i) => {
          const heading = item.group !== items[i - 1]?.group ? item.group : null
          const Icon = item.group === 'Recent' ? Clock : item.icon
          const on = i === current
          const doing = item.group === 'Actions' || item.group === 'Suggested'
          return (
            <div key={`${item.group}:${item.id}`}>
              {heading && (
                <div className="flex items-center gap-1.5 px-2 pt-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {heading === 'Suggested' && <Plus className="size-3 text-primary" />}
                  {heading}
                </div>
              )}
              <button
                type="button"
                id={`palette-${i}`}
                role="option"
                aria-selected={on}
                data-index={i}
                onMouseMove={() => !on && setActive(i)}
                onClick={() => go(item)}
                className={cn(
                  'relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  on && 'bg-primary/10 text-primary',
                )}
              >
                {on && <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
                    on ? 'bg-primary text-primary-foreground' : doing ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className={cn('min-w-0 flex-1 truncate', on && 'font-medium')}>{item.label}</span>
                {item.hint && <span className={cn('shrink-0 text-xs tabular-nums', on ? 'text-primary/80' : 'text-muted-foreground')}>{item.hint}</span>}
                {on ? <CornerDownLeft className="size-3.5 shrink-0" /> : <ArrowRight className="size-3.5 shrink-0 text-transparent" />}
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-3 border-t bg-muted/40 px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Key>↑</Key>
          <Key>↓</Key> move
        </span>
        <span className="flex items-center gap-1">
          <Key>↵</Key> open
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <Key>&gt;</Key> actions only
        </span>
        <span className="ml-auto truncate">
          Try <span className="font-medium text-primary">42.50</span> to find a transaction
        </span>
      </div>
    </div>
  )
}

function merchantItem(m: { name: string; count: number }): Item {
  return {
    id: `m:${m.name}`,
    label: m.name,
    hint: `${m.count} transaction${m.count === 1 ? '' : 's'}`,
    icon: Store,
    group: 'Merchants',
    to: `/transactions?q=${encodeURIComponent(m.name)}&period=all`,
  }
}

function Key({ children }: { children: string }) {
  return <kbd className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border bg-background px-1 font-sans text-[10px]">{children}</kbd>
}
