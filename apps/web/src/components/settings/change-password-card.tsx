import { Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	isStrongPassword,
	PASSWORD_MAX,
	PasswordRules,
} from "@/components/common/password-rules"
import { useNavigate } from "@tanstack/react-router"
import { authClient, signOut } from "@/lib/auth-client"
import { queryClient, useHasPassword } from "@/lib/queries"

/** Form to change the password, or set one on a passwordless account. */
export function ChangePasswordCard() {
	const navigate = useNavigate()
	const hasPassword = useHasPassword()
	const [current, setCurrent] = useState("")
	const [next, setNext] = useState("")
	const [confirm, setConfirm] = useState("")
	const [signOutOthers, setSignOutOthers] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [needsRelogin, setNeedsRelogin] = useState(false)
	const [busy, setBusy] = useState(false)
	const { saved, flash } = useSavedFlash()

	if (hasPassword.isPending) {
		return null
	}
	if (hasPassword.isError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Password</CardTitle>
					<CardDescription>
						Could not load account details. Try again in a moment.
					</CardDescription>
				</CardHeader>
			</Card>
		)
	}
	const passwordless = hasPassword.data?.hasPassword === false
	const mismatch = confirm.length > 0 && next !== confirm
	const sameAsOld = next.length > 0 && next === current
	const changeValid =
		current.length > 0 &&
		isStrongPassword(next) &&
		next === confirm &&
		!sameAsOld
	const setValid = isStrongPassword(next) && next === confirm

	async function submitChange(event: React.FormEvent) {
		event.preventDefault()
		if (!changeValid) {
			return
		}
		setBusy(true)
		setError(null)
		try {
			const { error: authError } = await authClient.changePassword({
				currentPassword: current,
				newPassword: next,
				revokeOtherSessions: signOutOthers,
			})
			if (authError) {
				setError(
					authError.code === "INVALID_PASSWORD"
						? "Your current password is wrong."
						: (authError.message ??
								"Could not change your password")
				)
				return
			}
			setCurrent("")
			setNext("")
			setConfirm("")
			toast.success(
				signOutOthers
					? "Password changed. Other devices were logged out."
					: "Password changed"
			)
			flash()
			void queryClient.invalidateQueries({
				queryKey: ["auth", "sessions"],
			})
		} finally {
			setBusy(false)
		}
	}

	async function submitSet(event: React.FormEvent) {
		event.preventDefault()
		if (!setValid) {
			return
		}
		setBusy(true)
		setError(null)
		setNeedsRelogin(false)
		try {
			const response = await fetch("/api/auth/password/set", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					newPassword: next,
					revokeOtherSessions: signOutOthers,
				}),
			})
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					message?: string
					code?: string
				} | null
				if (body?.code === "RECENT_LOGIN_REQUIRED") {
					setNeedsRelogin(true)
					setError(
						body.message ??
							"For your security, log in again with an email link first."
					)
					return
				}
				setError(body?.message ?? "Could not set your password")
				return
			}
			setNext("")
			setConfirm("")
			toast.success(
				signOutOthers
					? "Password set. Other devices were logged out."
					: "Password set"
			)
			flash()
			void queryClient.invalidateQueries({
				queryKey: ["auth", "has-password"],
			})
			void queryClient.invalidateQueries({
				queryKey: ["auth", "sessions"],
			})
		} catch {
			setError(
				"Could not reach the server. Check your connection and try again."
			)
		} finally {
			setBusy(false)
		}
	}

	if (passwordless) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Set a Password</CardTitle>
					<CardDescription>
						Add a password so you can sign in without an email link.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={submitSet} className="grid gap-4">
						{error && (
							<Alert
								variant="destructive"
								className="animate-in duration-200 fade-in-0"
							>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						{needsRelogin ? (
							<Button
								type="button"
								variant="outline"
								className="w-fit"
								onClick={() => {
									void signOut({
										fetchOptions: {
											onSuccess: () => {
												void navigate({
													to: "/login",
													replace: true,
												})
											},
										},
									})
								}}
							>
								Sign out and request a login link
							</Button>
						) : null}
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="grid gap-2">
								<Label htmlFor="set-new-password">
									New Password
								</Label>
								<Input
									id="set-new-password"
									type="password"
									autoComplete="new-password"
									value={next}
									onChange={(event) =>
										setNext(event.target.value)
									}
									aria-describedby="set-new-password-rules"
									maxLength={PASSWORD_MAX}
									required
								/>
								<PasswordRules
									id="set-new-password-rules"
									password={next}
									className="sm:grid-cols-1"
								/>
							</div>
							<div className="grid content-start gap-2">
								<Label htmlFor="set-confirm-password">
									Confirm new password
								</Label>
								<Input
									id="set-confirm-password"
									type="password"
									autoComplete="new-password"
									value={confirm}
									onChange={(event) =>
										setConfirm(event.target.value)
									}
									aria-invalid={mismatch || undefined}
									required
								/>
								{mismatch && (
									<p className="animate-in text-xs text-destructive duration-200 fade-in-0">
										Passwords don’t match.
									</p>
								)}
							</div>
						</div>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<Label className="flex items-center gap-2 font-normal">
								<Checkbox
									checked={signOutOthers}
									onCheckedChange={(checked) =>
										setSignOutOthers(checked === true)
									}
								/>
								Logout my other devices
							</Label>
							<div className="flex items-center gap-2">
								<SavedIndicator saved={saved} />
								<Button
									type="submit"
									disabled={busy || !setValid}
								>
									{busy && (
										<Loader2 className="animate-spin" />
									)}{" "}
									Set password
								</Button>
							</div>
						</div>
					</form>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Password</CardTitle>
				<CardDescription>
					Change the password you log in to Ledger with.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={submitChange} className="grid gap-4">
					{error && (
						<Alert
							variant="destructive"
							className="animate-in duration-200 fade-in-0"
						>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
					<div className="grid gap-2 sm:max-w-sm">
						<Label htmlFor="current-password">
							Current password
						</Label>
						<Input
							id="current-password"
							type="password"
							autoComplete="current-password"
							value={current}
							onChange={(event) => setCurrent(event.target.value)}
							required
						/>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="new-password">New Password</Label>
							<Input
								id="new-password"
								type="password"
								autoComplete="new-password"
								value={next}
								onChange={(event) =>
									setNext(event.target.value)
								}
								aria-invalid={sameAsOld || undefined}
								aria-describedby="new-password-rules"
								maxLength={PASSWORD_MAX}
								required
							/>
							{sameAsOld ? (
								<p className="text-xs text-destructive">
									Pick something different from your current
									password.
								</p>
							) : (
								<PasswordRules
									id="new-password-rules"
									password={next}
									className="sm:grid-cols-1"
								/>
							)}
						</div>
						<div className="grid content-start gap-2">
							<Label htmlFor="confirm-new-password">
								Confirm new password
							</Label>
							<Input
								id="confirm-new-password"
								type="password"
								autoComplete="new-password"
								value={confirm}
								onChange={(event) =>
									setConfirm(event.target.value)
								}
								aria-invalid={mismatch || undefined}
								required
							/>
							{mismatch && (
								<p className="animate-in text-xs text-destructive duration-200 fade-in-0">
									Passwords don’t match.
								</p>
							)}
						</div>
					</div>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<Label className="flex items-center gap-2 font-normal">
							<Checkbox
								checked={signOutOthers}
								onCheckedChange={(checked) =>
									setSignOutOthers(checked === true)
								}
							/>
							Logout my other devices
						</Label>
						<div className="flex items-center gap-2">
							<SavedIndicator saved={saved} />
							<Button
								type="submit"
								disabled={busy || !changeValid}
							>
								{busy && <Loader2 className="animate-spin" />}{" "}
								Change password
							</Button>
						</div>
					</div>
				</form>
			</CardContent>
		</Card>
	)
}
