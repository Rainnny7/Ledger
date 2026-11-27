import { Loader2 } from "lucide-react"
import { SaveIcon } from "@/components/icons/save"
import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
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
import type { BackupInfo } from "@/components/admin/backup-types"
import { adminFetch, auditKey, backupsKey, tasksKey } from "@/lib/admin"
import { queryClient } from "@/lib/queries"

/** Makes a copy right away, with an optional note on why ("Before upgrading"). */
export function BackUpDialog({
	open,
	onOpenChange,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
}) {
	const [note, setNote] = useState("")
	const [saving, setSaving] = useState(false)

	async function backUp() {
		setSaving(true)
		try {
			const data = await adminFetch<{
				backups: BackupInfo[]
				summary: string
			}>("backups", { method: "POST", body: JSON.stringify({ note }) })
			queryClient.setQueryData(backupsKey, { backups: data.backups })
			void queryClient.invalidateQueries({ queryKey: tasksKey })
			void queryClient.invalidateQueries({ queryKey: auditKey })
			toast.success(data.summary)
			setNote("")
			onOpenChange(false)
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault()
						void backUp()
					}}
				>
					<DialogHeader>
						<DialogTitle>Back Up Now</DialogTitle>
						<DialogDescription>
							Saves a copy of the whole database alongside the
							daily ones. It counts towards the copies kept, so
							the oldest may be removed.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2">
						<Label htmlFor="backup-note">Reason (optional)</Label>
						<Input
							id="backup-note"
							value={note}
							maxLength={200}
							placeholder="Before upgrading"
							onChange={(event) => setNote(event.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={saving}>
							{saving ? (
								<Loader2 className="animate-spin" />
							) : (
								<SaveIcon size={24} className="flex" />
							)}{" "}
							Back up
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
