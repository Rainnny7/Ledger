import { useState } from "react"
import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"
import { toastError } from "@/lib/toast"
import { CurrencyPreferenceField } from "@/components/settings/currency-preference-field"
import { useAppConfig } from "@/lib/queries"
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

function overdraftSavedMessage(value: boolean) {
	return value
		? "Overdraft counts toward your balances"
		: "Balances show what the bank reports"
}

function hideAiSavedMessage(value: boolean) {
	return value ? "Ask Ledger buttons hidden" : "Ask Ledger buttons shown"
}

/** Display currency and overdraft-counting preferences. */
export function PreferencesCard() {
	const { data } = useSession()
	const demo = useDemoPrefs()
	const aiChat = Boolean(useAppConfig()?.aiChat)
	const saved =
		demo.includeOverdraft ??
		(data?.user as { includeOverdraft?: boolean | null } | undefined)
			?.includeOverdraft ??
		true
	const hideAiSaved =
		demo.hideAiSuggestions ??
		(data?.user as { hideAiSuggestions?: boolean | null } | undefined)
			?.hideAiSuggestions ??
		false
	const [pending, setPending] = useState<boolean | null>(null)
	const [hideAiPending, setHideAiPending] = useState<boolean | null>(null)
	const checked = pending ?? saved
	const hideAiChecked = hideAiPending ?? hideAiSaved
	const { saved: overdraftFlash, flash: flashOverdraft } = useSavedFlash()
	const { saved: hideAiFlash, flash: flashHideAi } = useSavedFlash()

	async function toggle(value: boolean) {
		if (demoMode) {
			setDemoPrefs({ includeOverdraft: value })
			toast.success(overdraftSavedMessage(value))
			flashOverdraft()
			return
		}
		setPending(value)
		const { error } = await authClient.updateUser({
			includeOverdraft: value,
		})
		if (error) {
			toastError(error.message ?? "Could not save that")
			setPending(null)
			return
		}
		await queryClient.invalidateQueries()
		toast.success(overdraftSavedMessage(value))
		flashOverdraft()
		setPending(null)
	}

	async function toggleHideAi(value: boolean) {
		if (demoMode) {
			setDemoPrefs({ hideAiSuggestions: value })
			toast.success(hideAiSavedMessage(value))
			flashHideAi()
			return
		}
		setHideAiPending(value)
		const { error } = await authClient.updateUser({
			hideAiSuggestions: value,
		})
		if (error) {
			toastError(error.message ?? "Could not save that")
			setHideAiPending(null)
			return
		}
		await queryClient.invalidateQueries()
		toast.success(hideAiSavedMessage(value))
		flashHideAi()
		setHideAiPending(null)
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
						<span className="flex items-center gap-2 font-medium">
							Include overdraft in balances
							<SavedIndicator
								saved={overdraftFlash}
								showLabel={false}
							/>
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
				{aiChat ? (
					<div
						id="settings-section-ai-suggestions"
						className="flex items-start justify-between gap-4"
					>
						<Label
							htmlFor="pref-hide-ai"
							className="grid gap-1 font-normal"
						>
							<span className="flex items-center gap-2 font-medium">
								Hide AI suggestions
								<SavedIndicator
									saved={hideAiFlash}
									showLabel={false}
								/>
							</span>
							<span className="text-sm text-muted-foreground">
								Removes the Ask Ledger sparkle buttons on
								transactions, goals, insights and other pages.
								The chat button in the corner still works.
							</span>
						</Label>
						<Switch
							id="pref-hide-ai"
							checked={hideAiChecked}
							disabled={hideAiPending !== null}
							onCheckedChange={(nextChecked) =>
								void toggleHideAi(nextChecked)
							}
						/>
					</div>
				) : null}
			</CardContent>
		</Card>
	)
}