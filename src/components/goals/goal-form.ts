import { useState } from "react"
import { toast } from "sonner"
import { api, type Goal, type GoalInput, type GoalKind } from "@/lib/api"
import { formatMoney, getDisplayCurrency, isoDate } from "@/lib/format"

/** Keep only digits and a single decimal point. */
export const decimalInput = (s: string) =>
  s.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const cents = (n: number) => Math.round(n * 100) / 100

/** Toast once a payment pushes a goal over the line. */
export function celebrate(before: Goal | null | undefined, after: Goal) {
  if (after.status === "done" && before?.status !== "done") {
    toast.success(
      after.kind === "payoff"
        ? `🎉 ${after.name} is paid off!`
        : `🎉 You reached ${after.name}!`,
      {
        description: `${formatMoney(after.target, after.currency)} — every bit of it.`,
        duration: 8000,
      }
    )
    return true
  }
  return false
}

// ---------------------------------------------------------------- create / edit

/** Everything the goal form holds, as typed. */
export interface GoalForm {
  name: string
  kind: GoalKind
  target: string
  currency: string
  starting: string
  hasDate: boolean
  date: string
  icon: string
  color: string
  notes: string
}

/** The form's values for a goal being edited, or a preset (or nothing) being created. */
export function goalFormFrom(src: Partial<GoalInput>): GoalForm {
  const inSixMonths = new Date()
  inSixMonths.setMonth(inSixMonths.getMonth() + 6)
  return {
    name: src.name ?? "",
    kind: src.kind ?? "save",
    target: src.target ? String(src.target) : "",
    currency: src.currency ?? getDisplayCurrency(),
    starting: "",
    hasDate: !!src.targetDate,
    date: src.targetDate ?? isoDate(inSixMonths),
    icon: src.icon ?? "target",
    color: src.color ?? "sunset",
    notes: src.notes ?? "",
  }
}

export function isGoalFormValid(f: GoalForm) {
  const targetN = Number(f.target)
  const startN = Number(f.starting || 0)
  return (
    f.name.trim().length > 0 &&
    Number.isFinite(targetN) &&
    targetN > 0 &&
    Number.isFinite(startN) &&
    startN >= 0 &&
    (!f.hasDate || ISO_DATE.test(f.date))
  )
}

/** What's sent to the server for the form (the starting amount is added only on create). */
export function goalBody(f: GoalForm): GoalInput {
  return {
    name: f.name.trim(),
    kind: f.kind,
    target: cents(Number(f.target)),
    currency: f.currency,
    targetDate: f.hasDate ? f.date : null,
    icon: f.icon,
    color: f.color,
    notes: f.notes.trim() || null,
  }
}

/** The "Already saved" amount to start a new goal with, if any. */
export function startingAmount(f: GoalForm) {
  const startN = Number(f.starting || 0)
  return startN > 0 ? cents(startN) : undefined
}

// ---------------------------------------------------------------- partial payment

export interface PaymentDraft {
  goal: Goal
  amount?: number
  date?: string
  note?: string
  transactionId?: string
}

export type PaymentDirection = "in" | "out"

export function isPaymentValid(value: number, date: string) {
  return Number.isFinite(value) && value > 0 && ISO_DATE.test(date)
}

/** Where the goal would stand after this payment, and that as a whole percentage. */
export function paymentPreview(
  goal: Goal | undefined,
  direction: PaymentDirection,
  value: number
) {
  if (!goal) return { after: 0, pct: 0 }
  const after = Math.max(
    0,
    goal.saved + (direction === "in" ? value || 0 : -(value || 0))
  )
  return { after, pct: Math.min(100, Math.floor((after / goal.target) * 100)) }
}

/** Handy amounts: what's left, and the weekly/monthly pace needed. */
export function quickAmounts(goal: Goal | undefined) {
  if (!goal) return []
  const payoff = goal.kind === "payoff"
  return [
    goal.neededPerWeek && {
      label: "Weekly pace",
      value: goal.neededPerWeek,
    },
    goal.neededPerMonth && {
      label: "Monthly pace",
      value: goal.neededPerMonth,
    },
    goal.remaining > 0 && {
      label: payoff ? "Pay it all" : "The rest",
      value: goal.remaining,
    },
  ].filter((q): q is { label: string; value: number } => !!q && q.value > 0)
}

/** Log the payment, then toast either the celebration or how far along it is. */
/** Create or update a goal from the dialog form. */
export async function submitGoal(
  goal: Goal | null | undefined,
  form: GoalForm,
  onClose: () => void
) {
  const body = goalBody(form)
  if (goal) {
    const { goal: updated } = await api.updateGoal(goal.id, body)
    toast.success("Goal updated")
    celebrate(goal, updated)
  } else {
    await api.createGoal({
      ...body,
      startingAmount: startingAmount(form),
    })
    toast.success(`New goal: ${body.name}`, {
      description: "You’ve got this. Log payments as you go.",
    })
  }
  onClose()
}

/** The create/edit dialog's state, refilled each time it opens. */
export function useGoalForm(
  open: boolean,
  goal: Goal | null | undefined,
  preset: Partial<GoalInput> | null | undefined,
  onClose: () => void
) {
  const [form, setForm] = useState<GoalForm>(() => goalFormFrom({}))
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<GoalForm>) => setForm((f) => ({ ...f, ...patch }))

  const formFor = open ? (goal ?? preset ?? "new") : null
  const [filledFor, setFilledFor] = useState<typeof formFor>(null)
  if (formFor !== filledFor) {
    setFilledFor(formFor)
    if (open) setForm(goalFormFrom(goal ?? preset ?? {}))
  }

  const valid = isGoalFormValid(form)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    try {
      await submitGoal(goal, form, onClose)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return { form, set, valid, saving, save, editing: !!goal }
}

/** Payment dialog state, refilled when the draft changes. */
export function usePaymentForm(
  draft: PaymentDraft | null,
  onClose: () => void
) {
  const [direction, setDirection] = useState<PaymentDirection>("in")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(isoDate)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const goal = draft?.goal

  const [filledFrom, setFilledFrom] = useState<typeof draft>(null)
  if (draft !== filledFrom) {
    setFilledFrom(draft)
    if (draft) {
      setDirection("in")
      setAmount(draft.amount ? String(Math.abs(draft.amount)) : "")
      setDate(draft.date ?? isoDate())
      setNote(draft.note ?? "")
    }
  }

  const value = Number(amount)
  const valid = goal ? isPaymentValid(value, date) : false
  const preview = paymentPreview(goal, direction, value)
  const quick = quickAmounts(goal)
  const payoff = goal?.kind === "payoff"

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || !valid) return
    setSaving(true)
    try {
      await logGoalPayment(draft, direction, value, date, note)
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return {
    goal,
    draft,
    direction,
    setDirection,
    amount,
    setAmount,
    date,
    setDate,
    note,
    setNote,
    valid,
    saving,
    save,
    preview,
    quick,
    payoff,
  }
}

export async function logGoalPayment(
  draft: PaymentDraft,
  direction: PaymentDirection,
  value: number,
  date: string,
  note: string
) {
  const { goal } = draft
  const signed = cents(value) * (direction === "in" ? 1 : -1)
  const { goal: updated } = await api.addGoalPayment(goal.id, {
    amount: signed,
    date,
    note: note.trim() || null,
    transactionId: draft.transactionId ?? null,
  })
  if (celebrate(goal, updated)) return
  const payoff = goal.kind === "payoff"
  toast.success(
    direction === "in"
      ? `${formatMoney(value, goal.currency)} ${payoff ? "paid toward" : "added to"} ${goal.name}`
      : `${formatMoney(value, goal.currency)} taken out of ${goal.name}`,
    {
      description: `${Math.floor(updated.progress * 100)}% of the way there`,
    }
  )
}
