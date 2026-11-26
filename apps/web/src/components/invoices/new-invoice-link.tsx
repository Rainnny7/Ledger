import { Link } from "@tanstack/react-router"
import { PlusIcon } from "@/components/icons/plus"
import { Button } from "@/components/ui/button"

/** React/UI entry: `NewInvoiceLink`. */
export function NewInvoiceLink({
	children,
	...props
}: React.ComponentProps<typeof Button>) {
	return (
		<Button
			render={<Link to="/invoices/new" />}
			nativeButton={false}
			{...props}
		>
			<PlusIcon size={24} className="flex" /> {children}
		</Button>
	)
}
