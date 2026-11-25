import { DatePicker } from "@/components/common/date-picker"
import type { useWorkInvoiceDialog } from "@/components/work/dialogs/use-work-invoice-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatShortDate } from "@/lib/format"
import { formatDuration } from "@/lib/work"

type Model = ReturnType<typeof useWorkInvoiceDialog>

/** React/UI entry: `InvoiceDialogMeta`. */
export function InvoiceDialogMeta({ model }: { model: Model }) {
	const {
		job,
		includeShifts,
		setIncludeShifts,
		date,
		setDate,
		proof,
		setProof,
		note,
		setNote,
		shifts,
		proofOk,
	} = model

	return (
		<>
			{shifts.length > 0 && (
				<label className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm">
					<Checkbox
						checked={includeShifts}
						onCheckedChange={(value) =>
							setIncludeShifts(value === true)
						}
						className="mt-0.5"
					/>
					<span>
						Put my {shifts.length} logged shift
						{shifts.length === 1 ? "" : "s"} on this bill
						<span className="block text-xs text-muted-foreground">
							{formatDuration(job!.unbilledHours)} since{" "}
							{formatShortDate(shifts.at(-1)!.date)}
						</span>
					</span>
				</label>
			)}

			<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
				<div className="grid min-w-0 gap-2">
					<Label htmlFor="inv-date">Billed on</Label>
					<DatePicker id="inv-date" value={date} onChange={setDate} />
				</div>
				<div className="grid min-w-0 gap-2">
					<Label htmlFor="inv-proof">Proof link</Label>
					<Input
						id="inv-proof"
						type="url"
						value={proof}
						maxLength={500}
						onChange={(event) => setProof(event.target.value)}
						placeholder="https://…screenshot"
						aria-invalid={!proofOk}
					/>
				</div>
			</div>

			<div className="grid min-w-0 gap-2">
				<Label htmlFor="inv-note">Note</Label>
				<Input
					id="inv-note"
					value={note}
					maxLength={300}
					onChange={(event) => setNote(event.target.value)}
					placeholder="Optional"
				/>
			</div>
		</>
	)
}
