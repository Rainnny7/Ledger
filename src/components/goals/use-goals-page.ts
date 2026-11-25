import { confirmDialog } from "@/lib/confirm"
import { useEffect, useMemo, useRef, useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { toast } from "sonner"
import type { PaymentDraft } from "@/components/goals/goal-form"
import { byUrgency } from "@/components/goals/goal-sort"
import { leaveShared, splitShared } from "@/lib/sharing"
import { api, type Goal, type GoalInput } from "@/lib/api"
import { isoDate } from "@/lib/format"
import { useConverter } from "@/lib/currency"
import { useGoals } from "@/lib/queries"
import { useIntent } from "@/lib/url-state"

async function removeGoal(g: Goal) {
  if (
    !(await confirmDialog({
      title: `Delete “${g.name}”?`,
      description: `Its ${g.payments.length} payment${g.payments.length === 1 ? "" : "s"} are deleted too. This can’t be undone.`,
      action: "Delete goal",
      destructive: true,
    }))
  )
    return
  try {
    await api.deleteGoal(g.id)
    toast.success("Goal deleted")
  } catch (err) {
    toast.error((err as Error).message)
  }
}

async function setGoalArchived(g: Goal, value: boolean) {
  try {
    await api.updateGoal(g.id, { archived: value })
    toast.success(value ? `${g.name} archived` : `${g.name} restored`)
  } catch (err) {
    toast.error((err as Error).message)
  }
}

export function useGoalsPage() {
  const { data, loading, error } = useGoals()
  const [creating, setCreating] = useState<Partial<GoalInput> | null>(null)
  const [editing, setEditing] = useState<Goal | null>(null)
  const [paying, setPaying] = useState<PaymentDraft | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [sharing, setSharing] = useState<Goal | null>(null)

  const [focusParam] = useQueryState("focus", parseAsString.withDefault(""))
  const scrolledTo = useRef("")
  useEffect(() => {
    if (!focusParam || !data || scrolledTo.current === focusParam) return
    const el = document.querySelector('[data-focused="true"]')
    if (!el) return
    scrolledTo.current = focusParam
    el.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [focusParam, data])

  const { own: goals, shared } = useMemo(
    () => splitShared(data?.goals ?? []),
    [data]
  )
  const sharedOpen = shared.filter((g) => !g.archived).toSorted(byUrgency)
  const open = useMemo(
    () =>
      goals
        .filter((g) => !g.archived && g.status !== "done")
        .toSorted(byUrgency),
    [goals]
  )
  const reached = goals.filter((g) => !g.archived && g.status === "done")
  const archived = goals.filter((g) => g.archived)

  const fx = useConverter()
  const saved = fx.sum(open.map((g) => [g.saved, g.currency]))
  const remaining = fx.sum(open.map((g) => [g.remaining, g.currency]))
  const perMonth = fx.sum(open.map((g) => [g.neededPerMonth ?? 0, g.currency]))
  const thisMonth = useMemo(() => {
    const prefix = isoDate().slice(0, 7)
    return fx.sum(
      goals.flatMap((g) =>
        g.payments
          .filter((p) => p.date.startsWith(prefix))
          .map((p) => [p.amount, g.currency] as const)
      )
    )
  }, [goals, fx])

  const startNew = (preset: Partial<GoalInput> = {}) => setCreating(preset)
  useIntent("new", () => startNew())

  const actions = {
    onPay: (goal: Goal) => setPaying({ goal }),
    onEdit: setEditing,
    onDelete: (g: Goal) => void removeGoal(g),
    onArchive: (g: Goal) => void setGoalArchived(g, !g.archived),
    onShare: (g: Goal) => setSharing(g),
    onLeave: (g: Goal) => void leaveShared("goal", g),
  }

  return {
    data,
    loading,
    error,
    creating,
    editing,
    paying,
    showArchived,
    setShowArchived,
    sharing,
    setSharing,
    goals,
    sharedOpen,
    open,
    reached,
    archived,
    saved,
    remaining,
    perMonth,
    thisMonth,
    startNew,
    actions,
    closeDialogs: () => {
      setCreating(null)
      setEditing(null)
    },
    closePaying: () => setPaying(null),
  }
}
