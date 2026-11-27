import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ChangePasswordChangeForm } from "@/components/settings/change-password-change-form"
import { ChangePasswordSetForm } from "@/components/settings/change-password-set-form"
import { useChangePasswordCard } from "@/components/settings/use-change-password-card"

/** Form to change the password, or set one on a passwordless account. */
export function ChangePasswordCard() {
	const card = useChangePasswordCard()

	if (card.hasPassword.isPending) {
		return (
			<Card aria-busy="true">
				<CardHeader>
					<CardTitle>Password</CardTitle>
					<CardDescription>
						Change the password you log in to Ledger with.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-4">
					<Skeleton className="h-9 sm:max-w-sm" />
					<div className="grid gap-4 sm:grid-cols-2">
						<Skeleton className="h-9" />
						<Skeleton className="h-9" />
					</div>
				</CardContent>
			</Card>
		)
	}
	if (card.hasPassword.isError) {
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

	if (card.passwordless) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Set a Password</CardTitle>
					<CardDescription>
						Add a password so you can sign in without an email link.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ChangePasswordSetForm card={card} />
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
				<ChangePasswordChangeForm card={card} />
			</CardContent>
		</Card>
	)
}
