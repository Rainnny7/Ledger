import { PlusIcon } from "@/components/icons/plus"
import { ShareDialog } from "@/components/sharing/share-bits"
import { Button } from "@/components/ui/button"
import { Bones } from "@/components/common/bones"
import { Skeleton } from "@/components/ui/skeleton"
import { WorkEntryDialog } from "@/components/work/dialogs/entry-dialog"
import { WorkInvoiceDialog } from "@/components/work/dialogs/invoice-dialog"
import { WorkJobDialog } from "@/components/work/dialogs/job-dialog"
import { WorkPaymentDialog } from "@/components/work/dialogs/payment-dialog"
import { QueryError } from "@/components/ui/query-error"
import { useWorkPage } from "@/pages/use-work-page"
import { WorkPageBody } from "@/pages/work-page-body"

/** Freelance jobs: log hours, bill clients, record payments, and share with partners. */
export function WorkPage() {
	const page = useWorkPage()

	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Work
					</h1>
					<p className="text-sm text-muted-foreground">
						Log your hours, bill them, and track every instalment
						until you’re paid in full.
					</p>
				</div>
				{page.jobs.length > 0 && (
					<Button onClick={() => page.setJobDialog({ job: null })}>
						<PlusIcon size={24} className="flex" /> Add job
					</Button>
				)}
			</div>

			{page.error && !page.data && (
				<QueryError
					message={page.error.message}
					onRetry={() => void page.reload()}
				/>
			)}

			<Bones
				name="work"
				className="grid gap-8"
				loading={!page.data && page.loading}
				fallback={
					<div className="grid gap-4">
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							{[0, 1, 2, 3].map((i) => (
								<Skeleton key={i} className="h-24 rounded-xl" />
							))}
						</div>
						<Skeleton className="h-72 rounded-xl" />
					</div>
				}
			>
				<WorkPageBody page={page} />
			</Bones>

			<WorkJobDialog
				open={!!page.jobDialog}
				job={page.jobDialog?.job}
				onClose={() => page.setJobDialog(null)}
			/>
			<WorkEntryDialog
				job={page.logging}
				onClose={() => page.setLogging(null)}
			/>
			<WorkInvoiceDialog
				draft={page.billing}
				onClose={() => page.setBilling(null)}
			/>
			<WorkPaymentDialog
				draft={page.paying}
				onClose={() => page.setPaying(null)}
			/>
			<ShareDialog
				kind="job"
				item={page.sharing}
				onClose={() => page.setSharing(null)}
			/>
		</div>
	)
}
