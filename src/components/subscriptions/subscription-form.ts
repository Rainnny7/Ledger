import { useState } from "react"
import { toast } from "sonner"
import {
  type Account,
  api,
  type Category,
  type Cycle,
  type CycleUnit,
  type Subscription,
  type SubscriptionInput,
} from "@/lib/api"
import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"
import {
  CYCLE_UNITS,
  customCycle,
  PRESET_CYCLES,
  parseCustomCycle,
} from "@/lib/cycles"
import { getDisplayCurrency, isoDate } from "@/lib/format"

export type SubscriptionDraft = Partial<SubscriptionInput> & { id?: string }

export const SUBSCRIPTION_CUSTOM_CYCLE = "custom"
export const NO_SUBSCRIPTION_ACCOUNT = "none"

export const subscriptionCycleItems = [
  ...PRESET_CYCLES,
  { value: SUBSCRIPTION_CUSTOM_CYCLE, label: "Custom…" },
]
export const subscriptionUnitItems = CYCLE_UNITS.map((u) => ({
  value: u.value,
  label: u.label,
}))
export const subscriptionCategoryItems = CATEGORY_LIST.map((c) => ({
  value: c,
  label: CATEGORY_META[c].label,
}))

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const cents = (n: number) => Math.round(n * 100) / 100
const decimalInput = (s: string) => s.replace(/[^\d.]/g, "")

export interface SubscriptionForm {
  name: string
  amount: string
  currency: string
  cycle: Cycle
  custom: boolean
  every: string
  unit: CycleUnit
  date: string
  category: Category
  accountId: string
  notes: string
}

function formFromDraft(
  draft: SubscriptionDraft,
  accounts: Account[]
): SubscriptionForm {
  const c = draft.cycle ?? "monthly"
  const parsed = parseCustomCycle(c)
  return {
    name: draft.name ?? "",
    amount: draft.amount ? String(draft.amount) : "",
    currency:
      draft.currency ??
      accounts.find((a) => a.id === draft.accountId)?.currency ??
      getDisplayCurrency(),
    cycle: c,
    custom: !!parsed,
    every: String(parsed?.every ?? 4),
    unit: parsed?.unit ?? "years",
    date: draft.anchorDate ?? isoDate(),
    category: draft.category ?? "subscriptions",
    accountId: draft.accountId ?? NO_SUBSCRIPTION_ACCOUNT,
    notes: draft.notes ?? "",
  }
}

function effectiveCycle(f: SubscriptionForm): Cycle {
  const unitMax = CYCLE_UNITS.find((u) => u.value === f.unit)?.max ?? 10
  const everyN = Number(f.every)
  const customValid =
    Number.isInteger(everyN) && everyN >= 1 && everyN <= unitMax
  return f.custom ? customCycle(customValid ? everyN : 1, f.unit) : f.cycle
}

export function isSubscriptionFormValid(f: SubscriptionForm) {
  const value = Number(f.amount)
  const unitMax = CYCLE_UNITS.find((u) => u.value === f.unit)?.max ?? 10
  const everyN = Number(f.every)
  const customValid =
    Number.isInteger(everyN) && everyN >= 1 && everyN <= unitMax
  return (
    f.name.trim().length > 0 &&
    Number.isFinite(value) &&
    value > 0 &&
    ISO_DATE.test(f.date) &&
    (!f.custom || customValid)
  )
}

export function subscriptionBody(
  draft: SubscriptionDraft,
  form: SubscriptionForm,
  theirs: boolean
): SubscriptionInput {
  const value = Number(form.amount)
  const body: SubscriptionInput = {
    name: form.name.trim(),
    amount: cents(value),
    currency: form.currency,
    cycle: effectiveCycle(form),
    anchorDate: form.date,
    category: form.category,
    accountId:
      form.accountId === NO_SUBSCRIPTION_ACCOUNT ? null : form.accountId,
    merchantKey: draft.merchantKey ?? null,
    notes: form.notes.trim() || null,
  }
  if (theirs) {
    delete body.accountId
    delete body.merchantKey
  }
  return body
}

export function subscriptionAccountItems(accounts: Account[]) {
  return [
    { value: NO_SUBSCRIPTION_ACCOUNT, label: "Not linked" },
    ...accounts.map((a) => ({
      value: a.id,
      label: `${a.name}${a.numberMasked ? ` · ${a.numberMasked}` : ""}`,
    })),
  ]
}

export function useSubscriptionForm(
  draft: SubscriptionDraft | null,
  existing: Subscription | null | undefined,
  accounts: Account[],
  onClose: () => void,
  onSaved?: () => void
) {
  const [form, setForm] = useState<SubscriptionForm>(() =>
    formFromDraft({ cycle: "monthly" }, accounts)
  )
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<SubscriptionForm>) =>
    setForm((f) => ({ ...f, ...patch }))

  const [filledFrom, setFilledFrom] = useState<typeof draft>(null)
  if (draft !== filledFrom) {
    setFilledFrom(draft)
    if (draft) setForm(formFromDraft(draft, accounts))
  }

  const theirs = !!existing && existing.access !== "owner"
  const editing = !!draft?.id
  const valid = draft ? isSubscriptionFormValid(form) : false
  const unitMax = CYCLE_UNITS.find((u) => u.value === form.unit)?.max ?? 10
  const everyN = Number(form.every)
  const customValid =
    Number.isInteger(everyN) && everyN >= 1 && everyN <= unitMax

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || !valid) return
    setSaving(true)
    const body = subscriptionBody(draft, form, theirs)
    try {
      if (draft.id) await api.updateSubscription(draft.id, body)
      else await api.createSubscription(body)
      toast.success(editing ? "Subscription updated" : `Tracking ${body.name}`)
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return {
    form,
    set,
    saving,
    save,
    valid,
    editing,
    theirs,
    unitMax,
    customValid,
    decimalInput,
  }
}
