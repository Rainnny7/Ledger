import { buildAdvice, type AdvisorReport, type Tip } from "@/lib/advisor"
import { api } from "@/lib/api"
import { inHomeCurrency, useConverter } from "@/lib/currency"
import { demoMode } from "@/lib/demo"
import { isoDate } from "@/lib/format"
import {
  useDashboardTransactions,
  useGoals,
  useOverview,
  useSubscriptions,
} from "@/lib/queries"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useSyncExternalStore } from "react"
import { toast } from "sonner"

// Demo mode is read-only on the server, so hidden tips live in this tab until it reloads.
type Hidden = { id: string; until: string | null }[]
const NONE_HIDDEN: Hidden = []
let demoHidden: Hidden = []
const demoListeners = new Set<() => void>()
const demoStore = {
  subscribe: (l: () => void) => {
    demoListeners.add(l)
    return () => demoListeners.delete(l)
  },
  get: () => demoHidden,
  set: (next: typeof demoHidden) => {
    demoHidden = next
    for (const l of demoListeners) l()
  },
}

/**
 * The Advisor report for the signed-in person (or the demo), with hidden tips taken out.
 * Shares every query with the dashboard, so it costs nothing extra there.
 */
export function useAdvice() {
  const overview = useOverview()
  const txq = useDashboardTransactions()
  const subq = useSubscriptions()
  const goalq = useGoals()
  const converter = useConverter()
  const server = useQuery({
    queryKey: ["advice"],
    queryFn: api.adviceDismissed,
    enabled: !demoMode,
  })
  const local = useSyncExternalStore(demoStore.subscribe, demoStore.get)
  const hidden = demoMode ? local : (server.data?.dismissed ?? NONE_HIDDEN)

  const ready = Boolean(overview.data && txq.data && subq.data && goalq.data)
  const report = useMemo<AdvisorReport | null>(() => {
    if (!overview.data || !txq.data || !subq.data || !goalq.data) return null
    const home = inHomeCurrency(
      overview.data.accounts,
      txq.data.transactions,
      converter
    )
    if (home.transactions.length === 0) return null
    return buildAdvice({
      today: isoDate(),
      home: converter.home,
      accounts: home.accounts,
      transactions: home.transactions,
      subscriptions: subq.data.subscriptions,
      suggestions: subq.data.suggestions,
      goals: goalq.data.goals,
      toHome: converter.toOr,
    })
  }, [overview.data, txq.data, subq.data, goalq.data, converter])

  const hiddenIds = useMemo(() => new Set(hidden.map((h) => h.id)), [hidden])
  const tips = useMemo(
    () => (report?.tips ?? []).filter((t) => !hiddenIds.has(t.id)),
    [report, hiddenIds]
  )
  const hiddenCount = (report?.tips.length ?? 0) - tips.length
  // Each hidden tip with when it comes back (null: hidden for good), soonest first.
  const hiddenTips = useMemo(() => {
    const until = new Map(hidden.map((h) => [h.id, h.until]))
    return (report?.tips ?? [])
      .filter((t) => hiddenIds.has(t.id))
      .map((tip) => ({ tip, until: until.get(tip.id) ?? null }))
      .toSorted((a, b) => (a.until ?? "9").localeCompare(b.until ?? "9"))
  }, [report, hiddenIds, hidden])

  async function dismiss(tip: Tip, days?: number) {
    const undo = async () => {
      if (demoMode) demoStore.set(demoHidden.filter((h) => h.id !== tip.id))
      else await api.restoreAdvice(tip.id)
    }
    try {
      if (demoMode) {
        demoStore.set([
          ...demoHidden.filter((h) => h.id !== tip.id),
          { id: tip.id, until: null },
        ])
      } else {
        await api.dismissAdvice(tip.id, days)
      }
      toast.success(days ? `Snoozed for ${days} days` : "Tip hidden", {
        action: {
          label: "Undo",
          onClick: () =>
            void undo().catch((e: Error) => toast.error(e.message)),
        },
      })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** Bring back one hidden tip, or all of them without an id. */
  async function restore(id?: string) {
    try {
      if (demoMode)
        demoStore.set(id ? demoHidden.filter((h) => h.id !== id) : [])
      else await api.restoreAdvice(id)
      toast.success(id ? "Tip is back" : "Hidden tips are back")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return {
    report,
    tips,
    hiddenCount,
    hiddenTips,
    loading: !ready,
    error: overview.error ?? txq.error,
    dismiss,
    restore,
  }
}
