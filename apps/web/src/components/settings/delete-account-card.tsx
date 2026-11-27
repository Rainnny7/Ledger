import { useState } from "react"
import { Trash2Icon } from "@/components/icons/trash-2"
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
import { queryClient, useHasPassword } from "@/lib/queries"

/** Danger-zone card that deletes the account and all its data after password confirmation. */
export function DeleteAccountCard() {
	const navigate = useNavigate()
	const [open, setOpen] = useState(false)
	const hasPassword = useHasPassword()
	if (hasPassword.isPending) {
		return null
	}
	if (hasPassword.isError) {
		return (
			<Card className="border-destructive/40">
				<CardHeader>
					<CardTitle>Delete Account</CardTitle>
					<CardDescription>
						Could not load account details. Try again in a moment.
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}
	const passwordless = hasPassword.data?.hasPassword === false
	return (
		<Card className="border-destructive/40">
			<CardHeader>
				<CardTitle>Delete Account</CardTitle>
				<CardDescription>
					Permanently delete your account and everything in it: linked
					banks, saved bank logins, accounts, transactions, categories
					and subscriptions. This can’t be undone.
				</CardDescription>
				<CardAction>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => setOpen(true)}
					>
						<Trash2Icon size={24} className="flex" /> Delete account
					</Button>
				</CardAction>
			</CardHeader>
			<PasswordDialog
				open={open}
				onClose={() => setOpen(false)}
				title="Delete your account and data?"
				description={
					passwordless
						? "All of your data is removed from this server immediately. Type DELETE to confirm; we'll email you a link to finish."
						: "All of your data is removed from this server immediately. Type DELETE and your password to confirm."
				}
				confirmWord="DELETE"
				action={
					passwordless
						? "Email me a confirmation link"
						: "Delete everything"
				}
				destructive
				requirePassword={!passwordless}
				run={async (password) => {
					const { data, error } = passwordless
						? await (async () => {
								let response: Response
								try {
									response = await fetch(
										"/api/auth/delete-user/request-link",
										{
											method: "POST",
											credentials: "include",
											headers: {
												"content-type":
													"application/json",
											},
											body: JSON.stringify({
												callbackURL: "/login",
											}),
										}
									)
								} catch {
									return {
										data: null,
										error: {
											message:
												"Could not reach the server. Check your connection and try again.",
										},
									}
								}
								if (!response.ok) {
									const body = (await response
										.json()
										.catch(() => null)) as {
										message?: string
									} | null
									return {
										data: null,
										error: {
											message:
												body?.message ??
												"Could not send the confirmation email",
										},
									}
								}
								return {
									data: (await response.json()) as {
										message?: string
									},
									error: null,
								}
							})()
						: await authClient.deleteUser({ password })
					if (error) {
						return error.message ?? "Could not delete your account"
					}
					if (passwordless) {
						if (data?.message === "Verification email sent") {
							toast.success(
								"Check your email for a link to confirm deletion."
							)
							return null
						}
						return "Could not send the confirmation email"
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
