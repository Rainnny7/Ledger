import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { type Account, api, type Category, type Cycle, type CycleUnit, type Subscription, type SubscriptionInput } from '@/lib/api'
import { CATEGORY_LIST, CATEGORY_META } from '@/lib/categories'
import { CYCLE_UNITS, customCycle, PRESET_CYCLES, parseCustomCycle } from '@/lib/cycles'
import { formatLongDate, formatMoney, isoDate } from '@/lib/format'

export type SubscriptionDraft = Partial<SubscriptionInput> & { id?: string }

const CUSTOM = 'custom'
const cycleItems = [...PRESET_CYCLES, { value: CUSTOM, label: 'Custom…' }]
const unitItems = CYCLE_UNITS.map((u) => ({ value: u.value, label: u.label }))
const categoryItems = CATEGORY_LIST.map((c) => ({ value: c, label: CATEGORY_META[c].label }))
const NO_ACCOUNT = 'none'

interface Props {
  /** null = closed. A draft with an `id` edits that subscription. */
  draft: SubscriptionDraft | null
  /** The full record when editing, for its payment history. */
  existing?: Subscription | null
  accounts: Account[]
  onClose: () => void
  onSaved?: () => void
}

export function SubscriptionDialog({ draft, existing, accounts, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [custom, setCustom] = useState(false)
  const [every, setEvery] = useState('4')
  const [unit, setUnit] = useState<CycleUnit>('years')
  const [date, setDate] = useState(isoDate())
  const [category, setCategory] = useState<Category>('subscriptions')
  const [accountId, setAccountId] = useState<string>(NO_ACCOUNT)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!draft) return
    setName(draft.name ?? '')
    setAmount(draft.amount ? String(draft.amount) : '')
    const c = draft.cycle ?? 'monthly'
    const parsed = parseCustomCycle(c)
    setCycle(c)
    setCustom(!!parsed)
    setEvery(String(parsed?.every ?? 4))
    setUnit(parsed?.unit ?? 'years')
    setDate(draft.anchorDate ?? isoDate())
    setCategory(draft.category ?? 'subscriptions')
    setAccountId(draft.accountId ?? NO_ACCOUNT)
    setNotes(draft.notes ?? '')
  }, [draft])

  const accountItems = [
    { value: NO_ACCOUNT, label: 'Not linked' },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name}${a.numberMasked ? ` · ${a.numberMasked}` : ''}` })),
  ]
  const editing = !!draft?.id
  const value = Number(amount)
  const unitMax = CYCLE_UNITS.find((u) => u.value === unit)?.max ?? 10
  const everyN = Number(every)
  const customValid = Number.isInteger(everyN) && everyN >= 1 && everyN <= unitMax
  const effectiveCycle: Cycle = custom ? customCycle(customValid ? everyN : 1, unit) : cycle
  const valid =
    name.trim().length > 0 && Number.isFinite(value) && value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && (!custom || customValid)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || !valid) return
    setSaving(true)
    const body: SubscriptionInput = {
      name: name.trim(),
      amount: Math.round(value * 100) / 100,
      cycle: effectiveCycle,
      anchorDate: date,
      category,
      accountId: accountId === NO_ACCOUNT ? null : accountId,
      merchantKey: draft.merchantKey ?? null,
      notes: notes.trim() || null,
    }
    try {
      if (draft.id) await api.updateSubscription(draft.id, body)
      else await api.createSubscription(body)
      toast.success(editing ? 'Subscription updated' : `Tracking ${body.name}`)
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit subscription' : 'Track a subscription'}</DialogTitle>
          <DialogDescription>
            {draft?.merchantKey
              ? 'Payments from your accounts that match this merchant are linked automatically.'
              : 'Add any recurring payment — streaming, phone, gym, rent.'}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="sub-name">Name</Label>
            <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Netflix" required autoFocus />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="sub-amount">Amount</Label>
              <Input
                id="sub-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="18.99"
                required
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label>Billed</Label>
              <Select
                items={cycleItems}
                value={custom ? CUSTOM : cycle}
                onValueChange={(v) => {
                  if (!v) return
                  if (v === CUSTOM) setCustom(true)
                  else {
                    setCustom(false)
                    setCycle(v as Cycle)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cycleItems.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {custom && (
            <div className="grid min-w-0 gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <Label htmlFor="sub-every">Repeats every</Label>
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
                <Input
                  id="sub-every"
                  inputMode="numeric"
                  value={every}
                  onChange={(e) => setEvery(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  aria-invalid={!customValid}
                />
                <Select items={unitItems} value={unit} onValueChange={(v) => v && setUnit(v as CycleUnit)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unitItems.map((u) => (
                      <SelectItem key={u.value} value={u.value}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!customValid && <p className="text-xs text-destructive">Enter a whole number from 1 to {unitMax}.</p>}
            </div>
          )}
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="sub-date">Billing date</Label>
            <Input id="sub-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <p className="text-xs text-muted-foreground">Any past or upcoming charge date — the next one is worked out for you.</p>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label>Category</Label>
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
            </div>
            <div className="grid min-w-0 gap-2">
              <Label>Paid from</Label>
              <Select items={accountItems} value={accountId} onValueChange={(v) => setAccountId(v ?? NO_ACCOUNT)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => <span className="truncate">{accountItems.find((a) => a.value === v)?.label}</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accountItems.map((a) => (
                    <SelectItem key={a.value} value={a.value} className="max-w-[min(24rem,85vw)]">
                      <span className="truncate">{a.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="sub-notes">Notes</Label>
            <Textarea
              id="sub-notes"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Shared family plan, cancel before renewal…"
            />
          </div>

          {existing && existing.payments.length > 0 && (
            <>
              <Separator />
              <div className="grid min-w-0 gap-2">
                <h3 className="text-sm font-medium">Payment history</h3>
                <ul className="grid max-h-48 gap-0.5 overflow-y-auto text-sm">
                  {existing.payments.map((p) => (
                    <li key={p.id} className="flex justify-between rounded-md px-2 py-1 odd:bg-muted/50">
                      <span className="text-muted-foreground">{formatLongDate(p.date)}</span>
                      <span className="tabular-nums">{formatMoney(Math.abs(p.amount), existing.currency)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {editing ? 'Save' : 'Track subscription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
