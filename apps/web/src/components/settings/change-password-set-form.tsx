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

/** Set-password form for accounts that only use magic links today. */
export function ChangePasswordSetForm({ card }: { card: CardState }) {
	return (
		<form onSubmit={card.submitSet} className="grid gap-4">
			{card.error && (
				<Alert
					variant="destructive"
					className="animate-in duration-200 fade-in-0"
				>
					<AlertDescription>{card.error}</AlertDescription>
				</Alert>
			)}
			{card.needsRelogin ? (
				<Button
					type="button"
					variant="outline"
					className="w-fit"
					onClick={card.requestRelogin}
				>
					Sign out and request a login link
				</Button>
			) : null}
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label htmlFor="set-new-password">New Password</Label>
					<Input
						id="set-new-password"
						type="password"
						autoComplete="new-password"
						value={card.next}
						onChange={(event) => card.setNext(event.target.value)}
						aria-describedby="set-new-password-rules"
						maxLength={PASSWORD_MAX}
						required
					/>
					<PasswordRules
						id="set-new-password-rules"
						password={card.next}
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
						disabled={card.busy || !card.setValid}
					>
						{card.busy && <Loader2 className="animate-spin" />} Set
						password
					</Button>
				</div>
			</div>
		</form>
	)
}
