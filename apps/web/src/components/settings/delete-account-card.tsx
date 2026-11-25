import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { PasswordDialog } from "@/components/settings/password-dialog"
import { authClient } from "@/lib/auth-client"
import { queryClient } from "@/lib/queries"

/** Danger-zone card that deletes the account and all its data after password confirmation. */
export function DeleteAccountCard() {
	const navigate = useNavigate()
	const [open, setOpen] = useState(false)
	return (
		<Card className="border-destructive/40">
			<CardHeader>
				<CardTitle>Delete account</CardTitle>
				<CardDescription>
					Permanently delete your account and everything in it: linked
					banks, saved bank sign-ins, accounts, transactions,
					categories and subscriptions. This can’t be undone.
				</CardDescription>
				<CardAction>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => setOpen(true)}
					>
						<Trash2 /> Delete account
					</Button>
				</CardAction>
			</CardHeader>
			<PasswordDialog
				open={open}
				onClose={() => setOpen(false)}
				title="Delete your account and data?"
				description="All of your data is removed from this server immediately. Type DELETE and your password to confirm."
				confirmWord="DELETE"
				action="Delete everything"
				destructive
				run={async (password) => {
					const { error } = await authClient.deleteUser({ password })
					if (error) {
						return error.message ?? "Could not delete your account"
					}
					queryClient.clear()
					toast.success("Your account and data were deleted")
					void navigate({ to: "/login", replace: true })
					return null
				}}
			/>
		</Card>
	)
}
