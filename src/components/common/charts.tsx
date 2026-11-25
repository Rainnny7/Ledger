import { lazy, Suspense, type ComponentProps } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "cn"

function ChartFallback({ className }: { className?: string }) {
  return (
    <Skeleton className={cn("aspect-auto h-56 w-full rounded-md", className)} />
  )
}

const BalanceChartLazy = lazy(() =>
  import("@/components/common/charts-impl").then((m) => ({
    default: m.BalanceChart,
  }))
)
const CashflowChartLazy = lazy(() =>
  import("@/components/common/charts-impl").then((m) => ({
    default: m.CashflowChart,
  }))
)
const CategoryBarsLazy = lazy(() =>
  import("@/components/common/charts-impl").then((m) => ({
    default: m.CategoryBars,
  }))
)

export function BalanceChart(props: ComponentProps<typeof BalanceChartLazy>) {
  return (
    <Suspense fallback={<ChartFallback className={props.className} />}>
      <BalanceChartLazy {...props} />
    </Suspense>
  )
}

export function CashflowChart(props: ComponentProps<typeof CashflowChartLazy>) {
  return (
    <Suspense fallback={<ChartFallback className={props.className} />}>
      <CashflowChartLazy {...props} />
    </Suspense>
  )
}

export function CategoryBars(props: ComponentProps<typeof CategoryBarsLazy>) {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full rounded-md" />}>
      <CategoryBarsLazy {...props} />
    </Suspense>
  )
}
