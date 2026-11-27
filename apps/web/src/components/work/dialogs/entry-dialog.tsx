import { DatePicker } from "@/components/common/date-picker"
import { Money } from "@/components/common/money"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, type WorkJob } from "@/lib/api"
import { formatMoney, isoDate } from "@/lib/format"
import { formatDuration, parseHours } from "@/lib/work"
import { notifyFailure, isIsoDateString } from "@/components/work/dialogs/form"
import { roundTo } from "@ledger/shared/money"

/** React/UI entry: `WorkEntryDialog`. */
export function WorkEntryDialog({
	job,
	onClose,
}: {
	job: WorkJob | null
	onClose: () => void
}) {
	const [hours, setHours] = useState("")
	const [date, setDate] = useState(isoDate)
	const [note, setNote] = useState("")
	const [saving, setSaving] = useState(false)

	// A fresh form each time it opens for a job.
	const [filledFor, setFilledFor] = useState<string | null>(null)
	if ((job?.id ?? null) !== filledFor) {
		setFilledFor(job?.id ?? null)
		if (job) {
			setHours("")
			setDate(isoDate())
			setNote("")
		}
	}

	const parsed = parseHours(hours)
	const valid =
		parsed !== null &&
		parsed > 0 &&
		parsed <= 10_000 &&
		isIsoDateString(date)

	async function save(event: React.FormEvent) {
		event.preventDefault()
		if (!job || !valid) {
			return
		}
		setSaving(true)
		try {
			const { job: updated } = await api.addWorkEntry(job.id, {
				date,
				hours: roundTo(parsed, 2),
				note: note.trim() || null,
			})
			toast.success(`Logged ${formatDuration(parsed)}`, {
				description: `${formatDuration(updated.unbilledHours)} not billed yet · ${formatMoney(updated.unbilledValue, updated.currency)}`,
			})
			onClose()
		} catch (error) {
			notifyFailure(error)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Log Hours</DialogTitle>
					<DialogDescription>
						{job?.name} · they’ll go on your next bill.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={(event) => void save(event)}
				>
					<div className="grid min-w-0 gap-2">
						<Label htmlFor="entry-hours">Hours</Label>
						<Input
							id="entry-hours"
							value={hours}
							onChange={(event) => setHours(event.target.value)}
							placeholder="3.5, 3:30 or 3h 30m"
							className="h-11 text-lg tabular-nums"
							required
							autoFocus
						/>
						<p className="h-4 text-xs text-muted-foreground">
							{parsed !== null && parsed > 0 && job && (
								<>
									{formatDuration(parsed)} ·{" "}
									<Money
										value={parsed * job.rate}
										currency={job.currency}
									/>
								</>
							)}
							{hours && parsed === null && (
								<span className="text-destructive">
									Try 3.5, 3:30 or 3h 30m
								</span>
							)}
						</p>
					</div>
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="entry-date">Date</Label>
							<DatePicker
								id="entry-date"
								value={date}
								max={isoDate()}
								onChange={setDate}
							/>
						</div>
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="entry-note">Note</Label>
							<Input
								id="entry-note"
								value={note}
								maxLength={300}
								onChange={(event) =>
									setNote(event.target.value)
								}
								placeholder="Optional"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!valid || saving}>
							{saving && <Loader2 className="animate-spin" />}
							Log hours
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
