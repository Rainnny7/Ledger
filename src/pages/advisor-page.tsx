import { Lightbulb } from "lucide-react"
import { perYear } from "@/components/advisor/advisor-meta"
import { AdvisorStat } from "@/components/advisor/advisor-stat"
import { AdvisorTipsSection } from "@/components/advisor/advisor-tips-section"
import { HealthCard } from "@/components/advisor/health-card"
import { useAdvice } from "@/components/advisor/use-advice"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Bones } from "@/components/common/bones"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/lib/format"

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
                  <AdvisorStat
                    label="You could keep"
                    value={potential >= 1 ? `~${perYear(potential)}` : "—"}
                    hint={
                      potential >= 1
                        ? "If you acted on every tip below"
                        : "No savings spotted right now"
                    }
                    accent={potential >= 1}
                  />
                  <AdvisorStat
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
                  <AdvisorStat
                    label="Cash cushion"
                    value={
                      s?.cushionMonths == null
                        ? "—"
                        : `${s.cushionMonths.toFixed(1)} mo`
                    }
                    hint="How long your cash would cover usual spending"
                  />
                  <AdvisorStat
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

              <AdvisorTipsSection
                tips={tips}
                hiddenCount={hiddenCount}
                hiddenTips={hiddenTips}
                onDismiss={dismiss}
                onRestore={restore}
              />
            </>
          )}
        </Bones>
      )}
    </div>
  )
}
