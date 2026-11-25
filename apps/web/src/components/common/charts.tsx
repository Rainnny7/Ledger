import { lazy, Suspense, type ComponentProps } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "cn"

function ChartFallback({ className }: { className?: string }) {
	return (
		<Skeleton
			className={cn("aspect-auto h-56 w-full rounded-md", className)}
		/>
	)
}

const BalanceChartLazy = lazy(() =>
	import("@/components/common/charts-impl").then((chartsModule) => ({
		default: chartsModule.BalanceChart,
	}))
)
const CashflowChartLazy = lazy(() =>
	import("@/components/common/charts-impl").then((chartsModule) => ({
		default: chartsModule.CashflowChart,
	}))
)
const CategoryBarsLazy = lazy(() =>
	import("@/components/common/charts-impl").then((chartsModule) => ({
		default: chartsModule.CategoryBars,
	}))
)

/** Lazy-loaded balance line chart; the uPlot bundle loads on first render. */
export function BalanceChart(props: ComponentProps<typeof BalanceChartLazy>) {
	return (
		<Suspense fallback={<ChartFallback className={props.className} />}>
			<BalanceChartLazy {...props} />
		</Suspense>
	)
}

/** Lazy-loaded monthly in/out cashflow chart. */
export function CashflowChart(props: ComponentProps<typeof CashflowChartLazy>) {
	return (
		<Suspense fallback={<ChartFallback className={props.className} />}>
			<CashflowChartLazy {...props} />
		</Suspense>
	)
}

/** Lazy-loaded spending-by-category bar list. */
export function CategoryBars(props: ComponentProps<typeof CategoryBarsLazy>) {
	return (
		<Suspense fallback={<Skeleton className="h-48 w-full rounded-md" />}>
			<CategoryBarsLazy {...props} />
		</Suspense>
	)
}
