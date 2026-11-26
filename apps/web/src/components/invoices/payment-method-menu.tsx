import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Trash2Icon } from "@/components/icons/trash-2"
import { PencilIcon } from "@/components/icons/pencil"
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
				<PencilIcon size={24} className="flex" /> Edit
			</DropdownMenuItem>
			<DropdownMenuItem variant="destructive" onClick={onRemove}>
				<Trash2Icon size={24} className="flex" /> Remove
			</DropdownMenuItem>
		</>
	)
}
