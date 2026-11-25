import { DatePicker } from '@/components/date-picker'
import { Hint } from '@/components/hint'
import { Money } from '@/components/money'
import { Loader2, Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CurrencySelect } from '@/components/currency-select'
import { GOAL_COLORS, GOAL_ICONS, GoalIcon, accentStyle } from '@/components/goal-bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api, type Goal, type GoalInput, type GoalKind } from '@/lib/api'
import { formatMoney, getDisplayCurrency, isoDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const money = (s: string) => s.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')

/** Toast once a payment pushes a goal over the line. */
export function celebrate(before: Goal | null | undefined, after: Goal) {
  if (after.status === 'done' && before?.status !== 'done') {
    toast.success(after.kind === 'payoff' ? `🎉 ${after.name} is paid off!` : `🎉 You reached ${after.name}!`, {
      description: `${formatMoney(after.target, after.currency)} — every bit of it.`,
      duration: 8000,
    })
    return true
  }
  return false
}

// ---------------------------------------------------------------- create / edit

export function GoalDialog({
  open,
  goal,
  preset,
  onClose,
}: {
  open: boolean
  /** Edit this goal; otherwise create one (optionally prefilled from `preset`). */
  goal?: Goal | null
  preset?: Partial<GoalInput> | null
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<GoalKind>('save')
  const [target, setTarget] = useState('')
  const [currency, setCurrency] = useState(getDisplayCurrency)
  const [starting, setStarting] = useState('')
  const [hasDate, setHasDate] = useState(false)
  const [date, setDate] = useState('')
  const [icon, setIcon] = useState('target')
  const [color, setColor] = useState('sunset')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const src = goal ?? preset ?? {}
    setName(src.name ?? '')
    setKind(src.kind ?? 'save')
    setTarget(src.target ? String(src.target) : '')
    setCurrency(src.currency ?? getDisplayCurrency())
    setStarting('')
    setHasDate(!!src.targetDate)
    const inSixMonths = new Date()
    inSixMonths.setMonth(inSixMonths.getMonth() + 6)
    setDate(src.targetDate ?? isoDate(inSixMonths))
    setIcon(src.icon ?? 'target')
    setColor(src.color ?? 'sunset')
    setNotes(src.notes ?? '')
  }, [open, goal, preset])

  const targetN = Number(target)
  const startN = Number(starting || 0)
  const valid =
    name.trim().length > 0 &&
    Number.isFinite(targetN) &&
    targetN > 0 &&
    Number.isFinite(startN) &&
    startN >= 0 &&
    (!hasDate || /^\d{4}-\d{2}-\d{2}$/.test(date))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const body: GoalInput = {
      name: name.trim(),
      kind,
      target: Math.round(targetN * 100) / 100,
      currency,
      targetDate: hasDate ? date : null,
      icon,
      color,
      notes: notes.trim() || null,
    }
    try {
      if (goal) {
        const { goal: updated } = await api.updateGoal(goal.id, body)
        toast.success('Goal updated')
        celebrate(goal, updated)
      } else {
        await api.createGoal({ ...body, startingAmount: startN > 0 ? Math.round(startN * 100) / 100 : undefined })
        toast.success(`New goal: ${body.name}`, { description: 'You’ve got this. Log payments as you go.' })
      }
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? 'Edit goal' : 'New goal'}</DialogTitle>
          <DialogDescription>Saving up for something, or paying something off? Set a target and chip away at it.</DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <ToggleGroup
            value={[kind]}
            onValueChange={(v) => v[0] && setKind(v[0] as GoalKind)}
            variant="outline"
            className="w-full"
          >
            <ToggleGroupItem value="save" className="flex-1">
              Save up
            </ToggleGroupItem>
            <ToggleGroupItem value="payoff" className="flex-1">
              Pay off
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex items-end gap-3">
            <GoalIcon goal={{ icon, color }} className="size-9" />
            <div className="grid min-w-0 flex-1 gap-2">
              <Label htmlFor="goal-name">Name</Label>
              <Input
                id="goal-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === 'payoff' ? 'Visa balance' : 'Trip to Japan'}
                required
                autoFocus
              />
            </div>
          </div>

          <div className={cn('grid gap-3', goal ? 'grid-cols-[minmax(0,1fr)_6.5rem]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem]')}>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="goal-target">{kind === 'payoff' ? 'Amount owed' : 'Target'}</Label>
              <Input id="goal-target" inputMode="decimal" value={target} onChange={(e) => setTarget(money(e.target.value))} placeholder="3000" required />
            </div>
            {!goal && (
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="goal-start">{kind === 'payoff' ? 'Already paid' : 'Already saved'}</Label>
                <Input id="goal-start" inputMode="decimal" value={starting} onChange={(e) => setStarting(money(e.target.value))} placeholder="0" />
              </div>
            )}
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="goal-currency">Currency</Label>
              <CurrencySelect id="goal-currency" value={currency} onChange={setCurrency} />
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="goal-date">Target date</Label>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setHasDate((v) => !v)}
              >
                {hasDate ? 'No deadline' : 'Add a deadline'}
              </button>
            </div>
            {hasDate ? (
              <DatePicker id="goal-date" value={date} min={isoDate()} onChange={setDate} />
            ) : (
              <p className="text-xs text-muted-foreground">A deadline lets Ledger tell you how much to put aside each week or month.</p>
            )}
          </div>

          <div className="grid min-w-0 gap-2">
            <Label>Icon</Label>
            <div className="grid grid-cols-8 gap-1.5">
              {Object.entries(GOAL_ICONS).map(([key, { icon: Icon, label }]) => (
                <Hint key={key} label={label}>
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={icon === key}
                  onClick={() => setIcon(key)}
                  className={cn(
                    'grid aspect-square place-items-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    icon === key && 'border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                  )}
                >
                  <Icon className="size-4" />
                </button>
                </Hint>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(GOAL_COLORS).map(([key, c]) => (
                <Hint key={key} label={c.label}>
                <button
                  type="button"
                  aria-label={c.label}
                  aria-pressed={color === key}
                  onClick={() => setColor(key)}
                  className={cn(
                    'size-7 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110',
                    color === key && 'ring-2 ring-foreground/70',
                  )}
                  style={accentStyle(key)}
                />
                </Hint>
              ))}
            </div>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="goal-notes">Why it matters</Label>
            <Textarea
              id="goal-notes"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Two weeks in Kyoto with Sam, spring 2027"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {goal ? 'Save' : 'Create goal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- partial payment

export interface PaymentDraft {
  goal: Goal
  amount?: number
  date?: string
  note?: string
  transactionId?: string
}

export function GoalPaymentDialog({ draft, onClose }: { draft: PaymentDraft | null; onClose: () => void }) {
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(isoDate())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const goal = draft?.goal

  useEffect(() => {
    if (!draft) return
    setDirection('in')
    setAmount(draft.amount ? String(Math.abs(draft.amount)) : '')
    setDate(draft.date ?? isoDate())
    setNote(draft.note ?? '')
  }, [draft])

  const value = Number(amount)
  const valid = Number.isFinite(value) && value > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const payoff = goal?.kind === 'payoff'
  const after = goal ? Math.max(0, goal.saved + (direction === 'in' ? value || 0 : -(value || 0))) : 0
  const pct = goal ? Math.min(100, Math.floor((after / goal.target) * 100)) : 0

  // Handy amounts: what's left, and the weekly/monthly pace needed.
  const quick = goal
    ? [
        goal.neededPerWeek && { label: 'Weekly pace', value: goal.neededPerWeek },
        goal.neededPerMonth && { label: 'Monthly pace', value: goal.neededPerMonth },
        goal.remaining > 0 && { label: payoff ? 'Pay it all' : 'The rest', value: goal.remaining },
      ].filter((q): q is { label: string; value: number } => !!q && q.value > 0)
    : []

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!goal || !valid) return
    setSaving(true)
    try {
      const signed = Math.round(value * 100) / 100 * (direction === 'in' ? 1 : -1)
      const { goal: updated } = await api.addGoalPayment(goal.id, {
        amount: signed,
        date,
        note: note.trim() || null,
        transactionId: draft?.transactionId ?? null,
      })
      if (!celebrate(goal, updated)) {
        toast.success(
          direction === 'in'
            ? `${formatMoney(value, goal.currency)} ${payoff ? 'paid toward' : 'added to'} ${goal.name}`
            : `${formatMoney(value, goal.currency)} taken out of ${goal.name}`,
          { description: `${Math.floor(updated.progress * 100)}% of the way there` },
        )
      }
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{payoff ? 'Log a payment' : 'Add to goal'}</DialogTitle>
          <DialogDescription>
            {goal && (
              <>
                {goal.name} · <Money value={goal.saved} currency={goal.currency} /> of <Money value={goal.target} currency={goal.currency} />
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <ToggleGroup value={[direction]} onValueChange={(v) => v[0] && setDirection(v[0] as 'in' | 'out')} variant="outline" className="w-full">
            <ToggleGroupItem value="in" className="flex-1">
              <Plus /> {payoff ? 'Payment' : 'Deposit'}
            </ToggleGroupItem>
            <ToggleGroupItem value="out" className="flex-1">
              <Minus /> {payoff ? 'Correction' : 'Withdraw'}
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="pay-amount">Amount</Label>
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(money(e.target.value))}
              placeholder="50"
              className="h-11 text-lg tabular-nums"
              required
              autoFocus
            />
            {direction === 'in' && quick.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quick.map((q) => (
                  <Button key={q.label} type="button" size="xs" variant="secondary" onClick={() => setAmount(String(q.value))}>
                    {q.label} · <Money value={q.value} currency={goal?.currency} />
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="pay-date">Date</Label>
              <DatePicker id="pay-date" value={date} max={isoDate()} onChange={setDate} />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="pay-note">Note</Label>
              <Input id="pay-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Birthday money" />
            </div>
          </div>

          {goal && valid && (
            <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm animate-in fade-in-0 duration-200">
              <div className="flex justify-between">
                <span className="text-muted-foreground">After this</span>
                <span className="font-medium tabular-nums">
                  <Money value={after} currency={goal.currency} /> · {pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, ...accentStyle(goal.color) }} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {direction === 'in' ? (payoff ? 'Log payment' : 'Add') : 'Take out'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
