import type { ReactNode } from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/lib/format"
import { cn } from "cn"

export function InsightsStat({
  label,
  value,
  negative,
  hint,
  change,
  loading,
}: {
  label: string
  value: ReactNode
  negative?: boolean
  hint?: string
  /** Compared with the period before; `goodWhenUp` picks which direction shows green. */
  change?: {
    now: number
    before: number
    label: string
    goodWhenUp: boolean
  } | null
  loading?: boolean
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <CardTitle
            className={`text-2xl! font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}
          >
            {value}
          </CardTitle>
        )}
        {change && !loading && <InsightsChange {...change} />}
        {hint && !loading && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </CardHeader>
    </Card>
  )
}

function InsightsChange({
  now,
  before,
  label,
  goodWhenUp,
}: {
  now: number
  before: number
  label: string
  goodWhenUp: boolean
}) {
  if (before <= 0) return null
  const pct = ((now - before) / before) * 100
  if (Math.abs(pct) < 0.5)
    return (
      <p className="text-xs text-muted-foreground">About the same {label}</p>
    )
  const up = pct > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <p
      className={cn(
        "flex items-center gap-0.5 text-xs font-medium",
        up === goodWhenUp
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-destructive"
      )}
      title={`${formatMoney(before)} ${label.replace(/^vs /, "in the ")}`}
    >
      <Icon className="size-3.5" />
      {Math.abs(pct) >= 1000 ? "10×+" : `${Math.round(Math.abs(pct))}%`}
      <span className="font-normal text-muted-foreground">{label}</span>
    </p>
  )
}
