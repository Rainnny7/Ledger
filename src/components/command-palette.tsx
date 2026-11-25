import {
  ArrowRight,
  BriefcaseBusiness,
  ChartPie,
  CornerDownLeft,
  FilePlus2,
  FileText,
  Landmark,
  Lightbulb,
  Receipt,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { Transaction } from '@/lib/api'
import { queryClient, useOverview } from '@/lib/queries'
import { cn } from '@/lib/utils'

interface Item {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  group: string
  /** Extra words that should match, beyond the label. */
  keywords?: string
  to: string
}

const PAGES: Item[] = [
  { id: 'p:/', label: 'Bank Accounts', icon: Wallet, to: '/', keywords: 'home dashboard balances' },
  { id: 'p:/transactions', label: 'Transactions', icon: Receipt, to: '/transactions', keywords: 'search spending' },
  { id: 'p:/insights', label: 'Insights', icon: ChartPie, to: '/insights', keywords: 'budgets categories spending' },
  { id: 'p:/subscriptions', label: 'Subscriptions', icon: RefreshCw, to: '/subscriptions', keywords: 'recurring bills' },
  { id: 'p:/goals', label: 'Goals', icon: Rocket, to: '/goals', keywords: 'savings payoff' },
  { id: 'p:/advisor', label: 'Advisor', icon: Lightbulb, to: '/advisor', keywords: 'tips advice' },
  { id: 'p:/work', label: 'Work', icon: BriefcaseBusiness, to: '/work', keywords: 'jobs hours shifts' },
  { id: 'p:/invoices', label: 'Invoices', icon: FileText, to: '/invoices', keywords: 'billing clients' },
  { id: 'p:/contacts', label: 'Contacts', icon: Users, to: '/contacts', keywords: 'people sharing' },
  { id: 'p:/settings', label: 'Settings', icon: Settings, to: '/settings', keywords: 'preferences currency password' },
].map((p) => ({ ...p, group: 'Pages' }))

const ACTIONS: Item[] = [{ id: 'a:invoice', label: 'New invoice', icon: FilePlus2, to: '/invoices/new', group: 'Create', keywords: 'create bill' }]

/** Whether every word typed appears somewhere in the item. */
function matches(item: Item, words: string[]) {
  const hay = `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** Merchants from whatever transactions are already loaded, so searching costs no request. */
function cachedMerchants() {
  const byKey = new Map<string, { name: string; count: number }>()
  for (const [, data] of queryClient.getQueriesData<{ transactions: Transaction[] }>({ queryKey: ['transactions'] })) {
    for (const t of data?.transactions ?? []) {
      const m = byKey.get(t.merchantKey)
      if (m) m.count++
      else byKey.set(t.merchantKey, { name: t.merchant, count: 1 })
    }
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count)
}

/** ⌘K / Ctrl+K: jump to a page, an account or a merchant's transactions. */
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
      <DialogContent showCloseButton={false} className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Go to</DialogTitle>
        <DialogDescription className="sr-only">Search pages, accounts and merchants</DialogDescription>
        {open && <Palette onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

const OPEN_EVENT = 'ledger:open-palette'
export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT))

function Palette({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const accounts = useOverview().data?.accounts
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const [merchants] = useState(cachedMerchants)

  const items = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const accountItems: Item[] = (accounts ?? []).map((a) => ({
      id: `acct:${a.id}`,
      label: a.name,
      hint: a.numberMasked ?? a.currency,
      icon: Landmark,
      group: 'Accounts',
      keywords: 'account',
      to: `/accounts/${a.id}`,
    }))
    const all = [...ACTIONS, ...PAGES, ...accountItems]
    if (!words.length) return all
    const found = all.filter((i) => matches(i, words))
    const merchantItems: Item[] = merchants
      .filter((m) => words.every((w) => m.name.toLowerCase().includes(w)))
      .slice(0, 6)
      .map((m) => ({
        id: `m:${m.name}`,
        label: m.name,
        hint: `${m.count} transaction${m.count === 1 ? '' : 's'}`,
        icon: Store,
        group: 'Merchants',
        to: `/transactions?q=${encodeURIComponent(m.name)}&period=all`,
      }))
    const search: Item = {
      id: 'search',
      label: `Search transactions for “${query.trim()}”`,
      icon: Search,
      group: 'Search',
      to: `/transactions?q=${encodeURIComponent(query.trim())}&period=all`,
    }
    return [...found, ...merchantItems, search]
  }, [query, accounts, merchants])

  const current = Math.min(active, items.length - 1)

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  function go(item: Item | undefined) {
    if (!item) return
    onDone()
    void navigate(item.to)
  }

  let lastGroup = ''
  return (
    <div className="flex max-h-[60svh] flex-col">
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
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
          placeholder="Go to a page, account or merchant…"
          aria-label="Search"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={items[current] ? `palette-${current}` : undefined}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
      </div>
      <div ref={listRef} id="palette-list" role="listbox" className="overflow-y-auto p-1.5">
        {items.map((item, i) => {
          const heading = item.group !== lastGroup ? item.group : null
          lastGroup = item.group
          const Icon = item.icon
          return (
            <div key={item.id}>
              {heading && <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{heading}</div>}
              <button
                type="button"
                id={`palette-${i}`}
                role="option"
                aria-selected={i === current}
                data-index={i}
                onMouseMove={() => i !== current && setActive(i)}
                onClick={() => go(item)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm',
                  i === current && 'bg-muted',
                )}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                {i === current ? (
                  <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ArrowRight className="size-3.5 shrink-0 text-transparent" />
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
