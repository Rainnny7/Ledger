import { useState } from "react"
import { toast } from "sonner"
import { CurrencySelect } from "@/components/common/currency-select"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { currencyName, useFx, useHomeCurrency } from "@/lib/currency"
import { demoMode, setDemoPrefs } from "@/lib/demo"
import { formatDate } from "@/lib/format"
import { queryClient } from "@/lib/queries"
import { toastError } from "@/lib/toast"

type CurrencyPreferenceFieldProps = {
	/** Prefix for the select element id (e.g. "pref" or "onboarding"). */
	idPrefix: string
	/** Extra helper text under the default currency description. */
	descriptionSuffix?: string
	className?: string
}

/** Default display currency control shared by Settings and onboarding. */
export function CurrencyPreferenceField({
	idPrefix,
	descriptionSuffix = "",
	className,
}: CurrencyPreferenceFieldProps) {
	const home = useHomeCurrency()
	const fx = useFx()
	const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)

	async function changeCurrency(code: string) {
		if (demoMode) {
			setDemoPrefs({ currency: code })
			toast.success(`Totals now show in ${currencyName(code)}`)
			return
		}
		setPendingCurrency(code)
		const { error } = await authClient.updateUser({ currency: code })
		if (error) {
			toastError(error.message ?? "Could not save that")
		} else {
			toast.success(`Totals now show in ${currencyName(code)}`)
			await queryClient.invalidateQueries()
		}
		setPendingCurrency(null)
	}

	const currencyId = `${idPrefix}-currency`

	return (
		<div
			className={
				className ??
				"flex flex-wrap items-start justify-between gap-4"
			}
		>
			<Label
				htmlFor={currencyId}
				className="grid flex-1 basis-64 gap-1 font-normal"
			>
				<span className="font-medium">Default Currency</span>
				<span className="text-sm text-muted-foreground">
					Totals across accounts, goals, subscriptions and jobs are
					shown in this currency, converting others at daily reference
					rates
					{fx?.date
						? ` (last updated ${formatDate(fx.date)})`
						: ""}
					. New goals, subscriptions and jobs start in it too.
					{descriptionSuffix}
				</span>
			</Label>
			<CurrencySelect
				id={currencyId}
				value={pendingCurrency ?? home}
				onChange={(currency) => void changeCurrency(currency)}
				disabled={pendingCurrency !== null}
				className="w-56"
			/>
		</div>
	)
}