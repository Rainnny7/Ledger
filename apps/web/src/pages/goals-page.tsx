import { PlusIcon } from "@/components/icons/plus"
import { GoalDialog } from "@/components/goals/goal-dialog"
import { GoalPaymentDialog } from "@/components/goals/goal-payment-dialog"
import { useGoalsPage } from "@/components/goals/use-goals-page"
import { ShareDialog } from "@/components/sharing/share-bits"
import { Button } from "@/components/ui/button"
import { Bones } from "@/components/common/bones"
import { Skeleton } from "@/components/ui/skeleton"
import { QueryError } from "@/components/ui/query-error"
import { GoalsPageBody } from "@/pages/goals-page-body"

/** Savings goals: targets, progress, and payments toward each one. */
export function GoalsPage() {
	const page = useGoalsPage()

	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Goals
					</h1>
					<p className="text-sm text-muted-foreground">
						Save up for the things you want, or pay down what you
						owe — one payment at a time.
					</p>
				</div>
				<Button onClick={() => page.startNew()}>
					<PlusIcon size={24} className="flex" /> New goal
				</Button>
			</div>

			{page.error && !page.data && (
				<QueryError
					message={page.error.message}
					onRetry={() => void page.reload()}
				/>
			)}

			<Bones
				name="goals"
				className="grid gap-8"
				loading={!page.data && page.loading}
				fallback={
					<div className="grid gap-4 md:grid-cols-2">
						<Skeleton className="h-56 rounded-xl" />
						<Skeleton className="h-56 rounded-xl" />
					</div>
				}
			>
				<GoalsPageBody page={page} />
			</Bones>

			<GoalDialog
				open={!!page.creating || !!page.editing}
				goal={page.editing}
				preset={page.creating}
				onClose={page.closeDialogs}
			/>
			<GoalPaymentDialog draft={page.paying} onClose={page.closePaying} />
			<ShareDialog
				kind="goal"
				item={page.sharing}
				onClose={() => page.setSharing(null)}
			/>
		</div>
	)
}
