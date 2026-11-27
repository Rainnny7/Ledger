import { useAdvice } from "@/components/advisor/use-advice"
import { Bones } from "@/components/common/bones"
import { Skeleton } from "@/components/ui/skeleton"
import { QueryError } from "@/components/ui/query-error"
import { AdvisorPageReport } from "@/pages/advisor-page-report"

/** Personalized money tips from your recent spending and account health. */
export function AdvisorPage() {
	const {
		report,
		tips,
		hiddenCount,
		hiddenTips,
		loading,
		error,
		retry,
		dismiss,
		restore,
	} = useAdvice()

	return (
		<div className="grid gap-8">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Advisor
				</h1>
				<p className="text-sm text-muted-foreground">
					Tips from your own spending: where it's running high, what
					you could cut, and what's going well. Worked out on your
					device from your accounts, subscriptions and goals.
				</p>
			</div>

			{error && !report ? (
				<QueryError
					message={error.message}
					onRetry={() => void retry()}
				/>
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
					<AdvisorPageReport
						report={report}
						tips={tips}
						hiddenCount={hiddenCount}
						hiddenTips={hiddenTips}
						onDismiss={dismiss}
						onRestore={restore}
					/>
				</Bones>
			)}
		</div>
	)
}
