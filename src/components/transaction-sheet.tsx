import { shownRunningBalance, useIncludeOverdraft } from '@/components/account-figures'
import { Loader2, Repeat, Target } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { GoalIcon } from '@/components/goal-bits'
import { GoalPaymentDialog, type PaymentDraft } from '@/components/goal-dialogs'
import { CategoryIcon, RelativeDate } from '@/components/tx-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { type Account, api, type Category, type Transaction } from '@/lib/api'
import { CATEGORY_LIST, CATEGORY_META } from '@/lib/categories'
import { demoMode } from '@/lib/demo'
import { formatLongDate, formatMoney, formatTimestamp } from '@/lib/format'
import { useGoals } from '@/lib/queries'
import { cn } from '@/lib/utils'

const categoryItems = CATEGORY_LIST.map((c) => ({ value: c, label: CATEGORY_META[c].label }))

interface Props {
  transaction: Transaction | null
  /** Used for merchant history. */
  transactions: Transaction[]
  accounts: Account[]
  onClose: () => void
  /** Called after a save; `merchantWide` means other rows may have changed too (reload). */
  onUpdated: (tx: Transaction, merchantWide: boolean) => void
  onSelect: (tx: Transaction) => void
}

export function TransactionSheet({ transaction: t, transactions, accounts, onClose, onUpdated, onSelect }: Props) {
  const navigate = useNavigate()
  const [category, setCategory] = useState<Category>('other')
  const [applyAll, setApplyAll] = useState(false)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState<PaymentDraft | null>(null)
  const goals = useGoals().data?.goals
  const openGoals = (goals ?? []).filter((g) => !g.archived && g.status !== 'done')
  // Goals this transaction has already been counted toward.
  const linked = t ? (goals ?? []).filter((g) => g.payments.some((p) => p.transactionId === t.id)) : []

  useEffect(() => {
    if (!t) return
    setCategory(t.category)
    setApplyAll(t.categorySource === 'rule')
    setNote(t.note ?? '')
  }, [t])

  const account = accounts.find((a) => a.id === t?.accountId)
  const includeOverdraft = useIncludeOverdraft()
  const currency = account?.currency ?? 'CAD'

  const history = useMemo(() => {
    if (!t) return null
    const same = transactions.filter((x) => x.merchantKey === t.merchantKey)
    const out = same.filter((x) => x.amount < 0)
    const spent = out.reduce((s, x) => s - x.amount, 0)
    return { list: same, count: same.length, spent, avg: out.length ? spent / out.length : 0, first: same.at(-1)?.date }
  }, [t, transactions])

  const dirty = !!t && (category !== t.category || applyAll !== (t.categorySource === 'rule') || note !== (t.note ?? ''))

  async function save() {
    if (!t) return
    setSaving(true)
    try {
      const body: Parameters<typeof api.updateTransaction>[1] = {}
      if (note !== (t.note ?? '')) body.note = note || null
      const catChanged = category !== t.category || applyAll !== (t.categorySource === 'rule')
      if (catChanged) {
        body.category = category
        body.applyToMerchant = applyAll
      }
      const { transaction } = await api.updateTransaction(t.id, body)
      onUpdated(transaction, catChanged && applyAll)
      toast.success(catChanged && applyAll ? `All ${t.merchant} transactions are now ${CATEGORY_META[category].label}` : 'Saved')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function resetCategory() {
    if (!t) return
    setSaving(true)
    try {
      const { transaction } = await api.updateTransaction(t.id, { category: null, applyToMerchant: t.categorySource === 'rule' })
      onUpdated(transaction, t.categorySource === 'rule')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <GoalPaymentDialog draft={paying} onClose={() => setPaying(null)} />
    <Sheet open={!!t} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md!">
        {t && history && (
          <>
            <SheetHeader className="gap-3 pb-0">
              <div className="flex items-center gap-3 pr-8">
                <CategoryIcon category={t.category} className="size-10" />
                <div className="min-w-0">
                  <SheetTitle className="truncate text-base">{t.merchant}</SheetTitle>
                  <SheetDescription className="truncate">{account?.name}</SheetDescription>
                </div>
              </div>
              <div>
                <div
                  className={cn(
                    'text-3xl font-semibold tracking-tight tabular-nums',
                    t.amount > 0 && 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {formatMoney(t.amount, currency, { sign: true })}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <RelativeDate date={t.date} seenAt={t.createdAt} />
                  {t.pending && <Badge variant="outline">Pending</Badge>}
                </div>
              </div>
            </SheetHeader>

            <div className="grid gap-5 px-4 pb-6">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
                <dt className="text-muted-foreground">Description</dt>
                <dd className="font-mono text-xs break-all">{t.description}</dd>
                <dt className="text-muted-foreground">{t.pending ? 'Authorized' : 'Posted'}</dt>
                <dd>{formatLongDate(t.date)}</dd>
                {t.runningBalance !== null && (
                  <>
                    <dt className="text-muted-foreground">Balance after</dt>
                    <dd className="tabular-nums">{formatMoney(shownRunningBalance(t, account, includeOverdraft), currency)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Account</dt>
                <dd>
                  {account?.name}
                  {account?.numberMasked ? ` · ${account.numberMasked}` : ''}
                </dd>
                <dt className="text-muted-foreground">First synced</dt>
                <dd>{formatTimestamp(t.createdAt)}</dd>
              </dl>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Category</Label>
                  {t.categorySource !== 'auto' && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                      onClick={() => void resetCategory()}
                    >
                      Reset to automatic
                    </button>
                  )}
                </div>
                <Select items={categoryItems} value={category} onValueChange={(v) => v && setCategory(v as Category)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_LIST.map((c) => {
                      const Icon = CATEGORY_META[c].icon
                      return (
                        <SelectItem key={c} value={c}>
                          <Icon /> {CATEGORY_META[c].label}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={applyAll} onCheckedChange={(v) => setApplyAll(v === true)} />
                  Always use this for {t.merchant} ({history.count})
                </label>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="tx-note">Note</Label>
                <Textarea
                  id="tx-note"
                  placeholder="Add a note — e.g. split with Sam, reimbursable…"
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={!dirty || saving} onClick={() => void save()}>
                  {saving && <Loader2 className="animate-spin" />}
                  Save changes
                </Button>
                {t.amount < 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      const q = new URLSearchParams({
                        track: t.merchantKey,
                        name: t.merchant,
                        amount: String(Math.abs(t.amount)),
                        date: t.date,
                        account: t.accountId,
                      })
                      navigate(`/subscriptions?${q}`)
                    }}
                  >
                    <Repeat /> Track as subscription
                  </Button>
                )}
                {!demoMode && openGoals.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" />}>
                      <Target /> Add to goal
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-56">
                      <DropdownMenuLabel>Count this toward…</DropdownMenuLabel>
                      {openGoals.map((g) => (
                        <DropdownMenuItem
                          key={g.id}
                          onClick={() =>
                            setPaying({ goal: g, amount: Math.abs(t.amount), date: t.date, note: t.merchant, transactionId: t.id })
                          }
                        >
                          <GoalIcon goal={g} className="size-5 rounded-md" />
                          <span className="truncate">{g.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {linked.length > 0 && (
                <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Target className="size-3.5" /> Counted toward {linked.map((g) => g.name).join(', ')}
                </p>
              )}

              <Separator />

              <div className="grid gap-3">
                <div>
                  <h3 className="text-sm font-medium">{t.merchant} history</h3>
                  <p className="text-xs text-muted-foreground">
                    {history.count} transaction{history.count === 1 ? '' : 's'}
                    {history.first ? ` since ${formatLongDate(history.first)}` : ''}
                    {history.spent > 0 &&
                      ` · ${formatMoney(history.spent, currency)} spent · avg ${formatMoney(history.avg, currency)}`}
                  </p>
                </div>
                <ul className="grid gap-0.5">
                  {history.list.slice(0, 12).map((x) => (
                    <li key={x.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(x)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                          x.id === t.id && 'bg-muted',
                        )}
                      >
                        <span className="text-muted-foreground">{formatLongDate(x.date)}</span>
                        <span className={cn('tabular-nums', x.amount > 0 && 'text-emerald-600 dark:text-emerald-400')}>
                          {formatMoney(x.amount, currency, { sign: true })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
    </>
  )
}
