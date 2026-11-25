import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"

/** React/UI entry: `WorkDialogFooter`. */
export function WorkDialogFooter({
	onClose,
	submitLabel,
	disabled,
	saving,
}: {
	onClose: () => void
	submitLabel: string
	disabled: boolean
	saving: boolean
}) {
	return (
		<DialogFooter>
			<Button type="button" variant="outline" onClick={onClose}>
				Cancel
			</Button>
			<Button type="submit" disabled={disabled || saving}>
				{saving && <Loader2 className="animate-spin" />}
				{submitLabel}
			</Button>
		</DialogFooter>
	)
}
