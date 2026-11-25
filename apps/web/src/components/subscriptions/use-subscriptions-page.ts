import { useEffect, useMemo, useRef, useState } from "react"
import { parseAsString, useQueryState, useQueryStates } from "nuqs"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import type { SubscriptionDraft } from "@/components/subscriptions/subscription-form"
import { subscriptionOccurrences } from "@/components/subscriptions/subscription-utils"
import { splitShared } from "@/lib/sharing"
import { api, type RecurringSuggestion, type Subscription } from "@/lib/api"
import { addDays, isoDate } from "@/lib/format"
import { useConverter } from "@/lib/currency"
import { useOverview, useSubscriptions } from "@/lib/queries"
import { URL_OPTIONS, useIntent } from "@/lib/url-state"

async function dismissSuggestion(suggestion: RecurringSuggestion) {
	try {
		await api.dismissSuggestion(suggestion.id)
	} catch (error) {
		toastError((error as Error).message)
	}
}

/**
 * State and actions for the subscriptions page: sorted lists, due dates, URL-driven
 * prefill/focus and the edit, share and track flows.
 */
export function useSubscriptionsPage() {
	const { data, loading, error, reload } = useSubscriptions()
	const overview = useOverview()
	const [focusParam] = useQueryState("focus", parseAsString.withDefault(""))
	const [prefill, setPrefill] = useQueryStates(
		{
			track: parseAsString,
			name: parseAsString,
			amount: parseAsString,
			date: parseAsString,
			account: parseAsString,
		},
		URL_OPTIONS
	)
	const [draft, setDraft] = useState<SubscriptionDraft | null>(null)
	const [editing, setEditing] = useState<Subscription | null>(null)
	const [sharing, setSharing] = useState<Subscription | null>(null)

	const accounts = overview.data?.accounts ?? []
	const { own: subs, shared } = useMemo(
		() => splitShared(data?.subscriptions ?? []),
		[data]
	)
	const suggestions = data?.suggestions ?? []
	const active = useMemo(
		() => subs.filter((subscription) => subscription.active),
		[subs]
	)
	const sorted = useMemo(
		() => [
			...[...subs].toSorted(
				(first, second) =>
					Number(second.active) - Number(first.active) ||
					first.nextDue.localeCompare(second.nextDue)
			),
			...[...shared].toSorted(
				(first, second) =>
					Number(second.active) - Number(first.active) ||
					first.nextDue.localeCompare(second.nextDue)
			),
		],
		[subs, shared]
	)

	const fx = useConverter()
	const monthly = fx.sum(
		active.map((subscription) => [
			subscription.monthly,
			subscription.currency,
		])
	)
	const suggestionCurrency = (suggestion: RecurringSuggestion) =>
		accounts.find((account) => account.id === suggestion.accountId)
			?.currency ?? fx.home
	const next = active.toSorted((first, second) =>
		first.nextDue.localeCompare(second.nextDue)
	)[0]
	const due30 = useMemo(() => {
		const today = isoDate()
		const end = addDays(today, 30)
		return active
			.flatMap((subscription) =>
				subscriptionOccurrences(subscription, today, end).map(
					(date) => ({
						s: subscription,
						date,
					})
				)
			)
			.toSorted((first, second) => first.date.localeCompare(second.date))
	}, [active])

	const focus = useMemo(
		() => new Set(focusParam.split(",").filter(Boolean)),
		[focusParam]
	)
	const scrolledTo = useRef("")
	useEffect(() => {
		if (!focusParam || !data || scrolledTo.current === focusParam) {
			return
		}
		const element = document.querySelector('[data-focused="true"]')
		if (!element) {
			return
		}
		scrolledTo.current = focusParam
		element.scrollIntoView({ block: "center", behavior: "smooth" })
	}, [focusParam, data])

	useEffect(() => {
		const { track: trackPref, name, amount, date, account } = prefill
		if (!trackPref) {
			return
		}
		// oxlint-disable-next-line react/set-state-in-effect -- open new-sub form when URL prefill params arrive
		setEditing(null)
		setDraft({
			merchantKey: trackPref,
			name: name ?? "",
			amount: Number(amount) || undefined,
			anchorDate: date ?? isoDate(),
			accountId: account,
			cycle: "monthly",
		})
		void setPrefill(null)
	}, [prefill, setPrefill])

	useIntent("new", () => openNew())

	function openNew(anchorDate?: string) {
		setEditing(null)
		setDraft({ cycle: "monthly", anchorDate: anchorDate ?? isoDate() })
	}

	function edit(subscription: Subscription) {
		if (subscription.access === "view") {
			return
		}
		setEditing(subscription)
		setDraft({
			id: subscription.id,
			name: subscription.name,
			amount: subscription.amount,
			cycle: subscription.cycle,
			anchorDate: subscription.nextDue,
			category: subscription.category,
			accountId: subscription.accountId,
			merchantKey: subscription.merchantKey,
			notes: subscription.notes,
			currency: subscription.currency,
		})
	}

	async function track(suggestion: RecurringSuggestion) {
		try {
			await api.createSubscription({
				name: suggestion.name,
				amount: suggestion.amount,
				cycle: suggestion.cycle,
				anchorDate: suggestion.lastDate,
				category: suggestion.category,
				accountId: suggestion.accountId,
				merchantKey: suggestion.merchantKey,
				currency: suggestionCurrency(suggestion),
			})
			toast.success(`Tracking ${suggestion.name}`)
		} catch (caughtError) {
			toastError((caughtError as Error).message)
		}
	}

	return {
		data,
		loading,
		error,
		reload,
		accounts,
		suggestions,
		active,
		sorted,
		subs,
		shared,
		monthly,
		next,
		due30,
		focus,
		draft,
		editing,
		sharing,
		setSharing,
		fx,
		suggestionCurrency,
		openNew,
		edit,
		track,
		dismiss: dismissSuggestion,
		closeDialog: () => {
			setDraft(null)
			setEditing(null)
		},
	}
}
