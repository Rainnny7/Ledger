import { ArrowLeft } from "lucide-react"
import { Link } from "@tanstack/react-router"

/** Navigates from an account detail view back to the dashboard list. */
export function AccountBackLink() {
	return (
		<Link
			to="/"
			className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
		>
			<ArrowLeft className="size-4" /> All accounts
		</Link>
	)
}
