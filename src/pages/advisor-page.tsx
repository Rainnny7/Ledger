import { BellOff, EyeOff, Lightbulb, RotateCcw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import {
  AREA_LABEL,
  KIND_META,
  perYear,
  TipCard,
  TipIcon,
  useAdvice,
} from "@/components/advisor-bits"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Bones } from "@/components/bones"
import { Skeleton } from "@/components/ui/skeleton"
import type { Health, Tip, TipArea } from "@/lib/advisor"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

const TONE: Record<Health["label"], string> = {
  Excellent: "text-emerald-600 dark:text-emerald-400",
  Good: "text-emerald-600 dark:text-emerald-400",
  Fair: "text-amber-600 dark:text-amber-400",
  "Needs attention": "text-rose-600 dark:text-rose-400",
}

/** The 0–100 money health score as a ring. */
function ScoreRing({ health }: { health: Health }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className={cn("relative size-36 shrink-0", TONE[health.label])}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          className="stroke-muted"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - health.score / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold text-foreground tabular-nums">
          {health.score}
        </span>
        <span className="text-xs font-medium">{health.label}</span>
      </div>
    </div>
  )
}

function HealthCard({ health }: { health: Health }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Money health</CardTitle>
        <CardDescription>
          A score out of 100 from how you've done over the last few months.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <ScoreRing health={health} />
        <ul className="grid w-full gap-3">
          {health.factors.map((f) => {
            const pct = f.max ? f.score / f.max : 0
            return (
              <li key={f.key} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{f.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {Math.round(f.score)}/{f.max}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700",
                      pct >= 0.7
                        ? "bg-emerald-500"
                        : pct >= 0.4
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    )}
                    style={{ width: `${Math.max(3, pct * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{f.detail}</p>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string
  value: string
  hint?: string
  accent?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle
          className={cn(
            "text-xl tabular-nums",
            accent && "text-emerald-600 dark:text-emerald-400"
          )}
        >
          {value}
        </CardTitle>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardHeader>
    </Card>
  )
}

/** "Snoozed until Dec 25" or "Hidden". */
function hiddenLabel(until: string | null) {
  if (!until) return "Hidden"
  const d = new Date(until)
  if (Number.isNaN(d.getTime())) return "Snoozed"
  return `Snoozed until ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
}

/** Every tip that's hidden or snoozed, so each can be brought back on its own (or all at once). */
function HiddenTipsDialog({
  items,
  open,
  onOpenChange,
  onRestore,
}: {
  items: { tip: Tip; until: string | null }[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onRestore: (id?: string) => Promise<void>
}) {
  // Nothing left to show: close rather than sit on an empty list.
  useEffect(() => {
    if (open && items.length === 0) onOpenChange(false)
  }, [open, items.length, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hidden tips</DialogTitle>
          <DialogDescription>
            Snoozed tips come back on their own. Restore any of them sooner
            here.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-[60vh] gap-2 overflow-y-auto">
          {items.map(({ tip, until }) => {
            const meta = KIND_META[tip.kind]
            return (
              <li
                key={tip.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <TipIcon kind={tip.kind} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tip.title}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {until ? (
                      <BellOff className="size-3" />
                    ) : (
                      <EyeOff className="size-3" />
                    )}
                    {hiddenLabel(until)} · {meta.label}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onRestore(tip.id)}
                >
                  Restore
                </Button>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => void onRestore()}>Restore all</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AdvisorPage() {
  const {
    report,
    tips,
    hiddenCount,
    hiddenTips,
    loading,
    error,
    dismiss,
    restore,
  } = useAdvice()
  const [area, setArea] = useState<TipArea | "all">("all")
  const [hiddenOpen, setHiddenOpen] = useState(false)

  const areas = useMemo(() => {
    const counts = new Map<TipArea, number>()
    for (const t of tips) counts.set(t.area, (counts.get(t.area) ?? 0) + 1)
    return [...counts.entries()]
  }, [tips])
  const shown = area === "all" ? tips : tips.filter((t) => t.area === area)
  // What the tips still showing are worth; hiding one takes it out of the figure.
  const potential = tips.reduce(
    (n, t) => n + (t.kind === "win" ? 0 : (t.yearly ?? 0)),
    0
  )
  const s = report?.summary

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Advisor</h1>
        <p className="text-sm text-muted-foreground">
          Tips from your own spending: where it's running high, what you could
          cut, and what's going well. Worked out on your device from your
          accounts, subscriptions and goals.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : (
        <Bones
          name="advisor"
          className="grid gap-8"
          loading={loading}
          fallback={
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-64 rounded-xl lg:col-span-2" />
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-28 rounded-xl lg:col-span-3" />
            </div>
          }
        >
          {!report ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Lightbulb className="size-5" />
              </span>
              <h2 className="font-medium">Nothing to go on yet</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Once a bank account is connected and a few weeks of transactions
                are in, tips show up here.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                {report.health ? (
                  <HealthCard health={report.health} />
                ) : (
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Money health</CardTitle>
                      <CardDescription>
                        No income shows up yet, so there's no score. It appears
                        once pay comes in.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
                <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <Stat
                    label="You could keep"
                    value={potential >= 1 ? `~${perYear(potential)}` : "—"}
                    hint={
                      potential >= 1
                        ? "If you acted on every tip below"
                        : "No savings spotted right now"
                    }
                    accent={potential >= 1}
                  />
                  <Stat
                    label="Savings rate"
                    value={
                      s?.savingsRate == null
                        ? "—"
                        : `${Math.round(s.savingsRate * 100)}%`
                    }
                    hint={
                      s?.avgIncome
                        ? `Of ${formatMoney(s.avgIncome)} a month coming in`
                        : undefined
                    }
                  />
                  <Stat
                    label="Cash cushion"
                    value={
                      s?.cushionMonths == null
                        ? "—"
                        : `${s.cushionMonths.toFixed(1)} mo`
                    }
                    hint="How long your cash would cover usual spending"
                  />
                  <Stat
                    label="Subscriptions"
                    value={
                      s
                        ? `${formatMoney(Math.round(s.subscriptionsYearly)).replace(/\.00$/, "")}/yr`
                        : "—"
                    }
                    hint={
                      s
                        ? `About ${formatMoney(s.subscriptionsYearly / 12)} a month`
                        : undefined
                    }
                  />
                </div>
              </div>

              <section className="grid gap-4" aria-label="Tips">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-semibold">
                    Tips{" "}
                    <span className="font-normal text-muted-foreground">
                      · {tips.length}
                    </span>
                  </h2>
                  {hiddenCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setHiddenOpen(true)}
                    >
                      <RotateCcw /> {hiddenCount} hidden · Show again
                    </Button>
                  )}
                  <HiddenTipsDialog
                    items={hiddenTips}
                    open={hiddenOpen}
                    onOpenChange={setHiddenOpen}
                    onRestore={restore}
                  />
                </div>
                {areas.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {[["all", tips.length] as const, ...areas].map(
                      ([key, n]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setArea(key)}
                          aria-pressed={area === key}
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            area === key
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          )}
                        >
                          {key === "all" ? "All" : AREA_LABEL[key]}{" "}
                          <span className="tabular-nums opacity-70">{n}</span>
                        </button>
                      )
                    )}
                  </div>
                )}
                {shown.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {tips.length === 0
                      ? "You're all caught up. New tips show up as your spending changes."
                      : "No tips here."}
                  </p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {shown.map((t) => (
                      <TipCard key={t.id} tip={t} onDismiss={dismiss} />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </Bones>
      )}
    </div>
  )
}
