import { Pencil, Trash2 } from "lucide-react"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import type { PaymentMethod } from "@/lib/api"

/** React/UI entry: `PaymentMethodMenu`. */
export function PaymentMethodMenu({
	onEdit,
	onRemove,
}: {
	method: PaymentMethod
	onEdit: () => void
	onRemove: () => void
}) {
	return (
		<>
			<DropdownMenuItem onClick={onEdit}>
				<Pencil /> Edit
			</DropdownMenuItem>
			<DropdownMenuItem variant="destructive" onClick={onRemove}>
				<Trash2 /> Remove
			</DropdownMenuItem>
		</>
	)
}
