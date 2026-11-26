import { useState } from "react"
import { toastError } from "@/lib/toast"
import { CurrencyPreferenceField } from "@/components/settings/currency-preference-field"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { authClient, useSession } from "@/lib/auth-client"
import { demoMode, setDemoPrefs, useDemoPrefs } from "@/lib/demo"
import { queryClient } from "@/lib/queries"

/** Display currency and overdraft-counting preferences. */
export function PreferencesCard() {
	const { data } = useSession()
	const demo = useDemoPrefs()
	const saved =
		demo.includeOverdraft ??
		(data?.user as { includeOverdraft?: boolean | null } | undefined)
			?.includeOverdraft ??
		true
	const [pending, setPending] = useState<boolean | null>(null)
	const checked = pending ?? saved

	async function toggle(value: boolean) {
		if (demoMode) {
			return setDemoPrefs({ includeOverdraft: value })
		}
		setPending(value)
		const { error } = await authClient.updateUser({
			includeOverdraft: value,
		})
		if (error) {
			toastError(error.message ?? "Could not save that")
		} else {
			await queryClient.invalidateQueries()
		}
		setPending(null)
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Preferences</CardTitle>
				<CardDescription>How Ledger shows your money.</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-6">
				<CurrencyPreferenceField idPrefix="pref" />
				<div className="flex items-start justify-between gap-4">
					<Label
						htmlFor="pref-overdraft"
						className="grid gap-1 font-normal"
					>
						<span className="font-medium">
							Include overdraft in balances
						</span>
						<span className="text-sm text-muted-foreground">
							Count the overdraft you can still draw on as part of
							your balance: totals, charts and the balance after
							each transaction. Turn off to see what the bank
							reports.
						</span>
					</Label>
					<Switch
						id="pref-overdraft"
						checked={checked}
						disabled={pending !== null}
						onCheckedChange={(nextChecked) =>
							void toggle(nextChecked)
						}
					/>
				</div>
			</CardContent>
		</Card>
	)
}