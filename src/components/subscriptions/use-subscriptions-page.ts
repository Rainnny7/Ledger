import { useEffect, useMemo, useRef, useState } from "react"
import { parseAsString, useQueryState, useQueryStates } from "nuqs"
import { toast } from "sonner"
import type { SubscriptionDraft } from "@/components/subscriptions/subscription-form"
import { subscriptionOccurrences } from "@/components/subscriptions/subscription-utils"
import { splitShared } from "@/lib/sharing"
import { api, type RecurringSuggestion, type Subscription } from "@/lib/api"
import { addDays, isoDate } from "@/lib/format"
import { useConverter } from "@/lib/currency"
import { useOverview, useSubscriptions } from "@/lib/queries"
import { URL_OPTIONS, useIntent } from "@/lib/url-state"

async function dismissSuggestion(g: RecurringSuggestion) {
  try {
    await api.dismissSuggestion(g.id)
  } catch (e) {
    toast.error((e as Error).message)
  }
}

export function useSubscriptionsPage() {
  const { data, loading, error } = useSubscriptions()
  const overview = useOverview()
  const [focusParam] = useQueryState("focus", parseAsString.withDefault(""))
  const [prefill, setPrefill] = useQueryStates(
    {
      track: parseAsString,
      name: parseAsString,
      amount: parseAsString,
      date: parseAsString,
      account: parseAsString,
    },
    URL_OPTIONS
  )
  const [draft, setDraft] = useState<SubscriptionDraft | null>(null)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [sharing, setSharing] = useState<Subscription | null>(null)

  const accounts = overview.data?.accounts ?? []
  const { own: subs, shared } = useMemo(
    () => splitShared(data?.subscriptions ?? []),
    [data]
  )
  const suggestions = data?.suggestions ?? []
  const active = useMemo(() => subs.filter((s) => s.active), [subs])
  const sorted = useMemo(
    () => [
      ...[...subs].toSorted(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          a.nextDue.localeCompare(b.nextDue)
      ),
      ...[...shared].toSorted(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          a.nextDue.localeCompare(b.nextDue)
      ),
    ],
    [subs, shared]
  )

  const fx = useConverter()
  const monthly = fx.sum(active.map((x) => [x.monthly, x.currency]))
  const suggestionCurrency = (g: RecurringSuggestion) =>
    accounts.find((a) => a.id === g.accountId)?.currency ?? fx.home
  const next = active.toSorted((a, b) => a.nextDue.localeCompare(b.nextDue))[0]
  const due30 = useMemo(() => {
    const today = isoDate()
    const end = addDays(today, 30)
    return active
      .flatMap((s) =>
        subscriptionOccurrences(s, today, end).map((date) => ({ s, date }))
      )
      .toSorted((a, b) => a.date.localeCompare(b.date))
  }, [active])

  const focus = useMemo(
    () => new Set(focusParam.split(",").filter(Boolean)),
    [focusParam]
  )
  const scrolledTo = useRef("")
  useEffect(() => {
    if (!focusParam || !data || scrolledTo.current === focusParam) return
    const el = document.querySelector('[data-focused="true"]')
    if (!el) return
    scrolledTo.current = focusParam
    el.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [focusParam, data])

  useEffect(() => {
    const { track: trackPref, name, amount, date, account } = prefill
    if (!trackPref) return
    // oxlint-disable-next-line react/set-state-in-effect -- open new-sub form when URL prefill params arrive
    setEditing(null)
    setDraft({
      merchantKey: trackPref,
      name: name ?? "",
      amount: Number(amount) || undefined,
      anchorDate: date ?? isoDate(),
      accountId: account,
      cycle: "monthly",
    })
    void setPrefill(null)
  }, [prefill, setPrefill])

  useIntent("new", () => openNew())

  function openNew(anchorDate?: string) {
    setEditing(null)
    setDraft({ cycle: "monthly", anchorDate: anchorDate ?? isoDate() })
  }

  function edit(s: Subscription) {
    if (s.access === "view") return
    setEditing(s)
    setDraft({
      id: s.id,
      name: s.name,
      amount: s.amount,
      cycle: s.cycle,
      anchorDate: s.nextDue,
      category: s.category,
      accountId: s.accountId,
      merchantKey: s.merchantKey,
      notes: s.notes,
      currency: s.currency,
    })
  }

  async function track(g: RecurringSuggestion) {
    try {
      await api.createSubscription({
        name: g.name,
        amount: g.amount,
        cycle: g.cycle,
        anchorDate: g.lastDate,
        category: g.category,
        accountId: g.accountId,
        merchantKey: g.merchantKey,
        currency: suggestionCurrency(g),
      })
      toast.success(`Tracking ${g.name}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return {
    data,
    loading,
    error,
    accounts,
    suggestions,
    active,
    sorted,
    subs,
    shared,
    monthly,
    next,
    due30,
    focus,
    draft,
    editing,
    sharing,
    setSharing,
    fx,
    suggestionCurrency,
    openNew,
    edit,
    track,
    dismiss: dismissSuggestion,
    closeDialog: () => {
      setDraft(null)
      setEditing(null)
    },
  }
}
