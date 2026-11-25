import { FileText, HandCoins, Pencil, Trash2 } from "lucide-react"
import { Link } from "react-router"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import type { WorkInvoice, WorkJob } from "@/lib/api"
import type { JobActions } from "@/components/work/job-actions"

export function BillMenu({
  job: j,
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
      {inv.status !== "paid" && !j.archived && (
        <DropdownMenuItem onClick={() => onPay(j, inv.id)}>
          <HandCoins /> Record payment
        </DropdownMenuItem>
      )}
      {j.access === "owner" && (
        <DropdownMenuItem
          render={<Link to={`/invoices/new?fromBill=${inv.id}`} />}
        >
          <FileText /> Make an invoice
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => onBill(j, inv)}>
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
