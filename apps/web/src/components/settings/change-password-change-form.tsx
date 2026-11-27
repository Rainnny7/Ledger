import { Loader2 } from "lucide-react"
import { SavedIndicator } from "@/components/common/saved-indicator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PASSWORD_MAX, PasswordRules } from "@/components/common/password-rules"
import type { useChangePasswordCard } from "@/components/settings/use-change-password-card"

type CardState = ReturnType<typeof useChangePasswordCard>

/** Change-password form for accounts that already have a password. */
export function ChangePasswordChangeForm({ card }: { card: CardState }) {
	return (
		<form onSubmit={card.submitChange} className="grid gap-4">
			{card.error && (
				<Alert
					variant="destructive"
					className="animate-in duration-200 fade-in-0"
				>
					<AlertDescription>{card.error}</AlertDescription>
				</Alert>
			)}
			<div className="grid gap-2 sm:max-w-sm">
				<Label htmlFor="current-password">Current password</Label>
				<Input
					id="current-password"
					type="password"
					autoComplete="current-password"
					value={card.current}
					onChange={(event) => card.setCurrent(event.target.value)}
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
						value={card.next}
						onChange={(event) => card.setNext(event.target.value)}
						aria-invalid={card.sameAsOld || undefined}
						aria-describedby="new-password-rules"
						maxLength={PASSWORD_MAX}
						required
					/>
					{card.sameAsOld ? (
						<p className="text-xs text-destructive">
							Pick something different from your current password.
						</p>
					) : (
						<PasswordRules
							id="new-password-rules"
							password={card.next}
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
						value={card.confirm}
						onChange={(event) =>
							card.setConfirm(event.target.value)
						}
						aria-invalid={card.mismatch || undefined}
						required
					/>
					{card.mismatch && (
						<p className="animate-in text-xs text-destructive duration-200 fade-in-0">
							Passwords don’t match.
						</p>
					)}
				</div>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<Label className="flex items-center gap-2 font-normal">
					<Checkbox
						checked={card.signOutOthers}
						onCheckedChange={(checked) =>
							card.setSignOutOthers(checked === true)
						}
					/>
					Logout my other devices
				</Label>
				<div className="flex items-center gap-2">
					<SavedIndicator saved={card.saved} />
					<Button
						type="submit"
						disabled={card.busy || !card.changeValid}
					>
						{card.busy && <Loader2 className="animate-spin" />}{" "}
						Change password
					</Button>
				</div>
			</div>
		</form>
	)
}
