import { FileText, HandCoins, Pencil, Trash2 } from "lucide-react"
import { Link } from "@tanstack/react-router"
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { WorkInvoice, WorkJob } from "@/lib/api"
import type { JobActions } from "@/components/work/job-actions"

/** React/UI entry: `BillMenu`. */
export function BillMenu({
	job,
	invoice: inv,
	onPay,
	onBill,
	onRemove,
}: {
	job: WorkJob
	invoice: WorkInvoice
	onPay: JobActions["onPay"]
	onBill: JobActions["onBill"]
	/** Only the job's owner can delete a bill. */
	onRemove?: () => void
}) {
	return (
		<>
			{inv.status !== "paid" && !job.archived && (
				<DropdownMenuItem onClick={() => onPay(job, inv.id)}>
					<HandCoins /> Record payment
				</DropdownMenuItem>
			)}
			{job.access === "owner" && (
				<DropdownMenuItem
					render={
						<Link
							to="/invoices/new"
							search={{ fromBill: inv.id }}
						/>
					}
				>
					<FileText /> Make an invoice
				</DropdownMenuItem>
			)}
			<DropdownMenuItem onClick={() => onBill(job, inv)}>
				<Pencil /> Edit bill
			</DropdownMenuItem>
			{onRemove && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onClick={onRemove}>
						<Trash2 /> Delete bill
					</DropdownMenuItem>
				</>
			)}
		</>
	)
}
