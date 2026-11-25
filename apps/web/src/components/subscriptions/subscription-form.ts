import { useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import {
	type Account,
	api,
	type Category,
	type Cycle,
	type CycleUnit,
	type Subscription,
	type SubscriptionInput,
} from "@/lib/api"
import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"
import {
	CYCLE_UNITS,
	customCycle,
	PRESET_CYCLES,
	parseCustomCycle,
} from "@/lib/cycles"
import { getDisplayCurrency, isoDate } from "@/lib/format"

/** Prefill values for the subscription dialog; an `id` means editing an existing subscription. */
export type SubscriptionDraft = Partial<SubscriptionInput> & { id?: string }

/** Select value that reveals the custom every-N-units cycle inputs. */
export const SUBSCRIPTION_CUSTOM_CYCLE = "custom"
/** Select value meaning the subscription is not linked to an account. */
export const NO_SUBSCRIPTION_ACCOUNT = "none"

/** Billing-cycle options: the presets plus a custom entry. */
export const subscriptionCycleItems = [
	...PRESET_CYCLES,
	{ value: SUBSCRIPTION_CUSTOM_CYCLE, label: "Custom…" },
]
/** Unit options for a custom billing cycle. */
export const subscriptionUnitItems = CYCLE_UNITS.map((unit) => ({
	value: unit.value,
	label: unit.label,
}))
/** Category options for the subscription category select. */
export const subscriptionCategoryItems = CATEGORY_LIST.map((category) => ({
	value: category,
	label: CATEGORY_META[category].label,
}))

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const cents = (amount: number) => Math.round(amount * 100) / 100
const decimalInput = (rawValue: string) => rawValue.replace(/[^\d.]/g, "")

/** Editable string-based form state of the subscription dialog. */
export interface SubscriptionForm {
	name: string
	amount: string
	currency: string
	cycle: Cycle
	custom: boolean
	every: string
	unit: CycleUnit
	date: string
	category: Category
	accountId: string
	notes: string
}

function formFromDraft(
	draft: SubscriptionDraft,
	accounts: Account[]
): SubscriptionForm {
	const cycle = draft.cycle ?? "monthly"
	const parsed = parseCustomCycle(cycle)
	return {
		name: draft.name ?? "",
		amount: draft.amount ? String(draft.amount) : "",
		currency:
			draft.currency ??
			accounts.find((account) => account.id === draft.accountId)
				?.currency ??
			getDisplayCurrency(),
		cycle,
		custom: !!parsed,
		every: String(parsed?.every ?? 4),
		unit: parsed?.unit ?? "years",
		date: draft.anchorDate ?? isoDate(),
		category: draft.category ?? "subscriptions",
		accountId: draft.accountId ?? NO_SUBSCRIPTION_ACCOUNT,
		notes: draft.notes ?? "",
	}
}

function effectiveCycle(form: SubscriptionForm): Cycle {
	const unitMax =
		CYCLE_UNITS.find((unit) => unit.value === form.unit)?.max ?? 10
	const everyN = Number(form.every)
	const customValid =
		Number.isInteger(everyN) && everyN >= 1 && everyN <= unitMax
	return form.custom
		? customCycle(customValid ? everyN : 1, form.unit)
		: form.cycle
}

/** Whether the form has a name, a positive amount, a valid date and (if custom) a valid cycle. */
export function isSubscriptionFormValid(form: SubscriptionForm) {
	const value = Number(form.amount)
	const unitMax =
		CYCLE_UNITS.find((unit) => unit.value === form.unit)?.max ?? 10
	const everyN = Number(form.every)
	const customValid =
		Number.isInteger(everyN) && everyN >= 1 && everyN <= unitMax
	return (
		form.name.trim().length > 0 &&
		Number.isFinite(value) &&
		value > 0 &&
		ISO_DATE.test(form.date) &&
		(!form.custom || customValid)
	)
}

/**
 * Builds the API payload from the form, omitting owner-only fields when the subscription
 * belongs to someone else.
 */
export function subscriptionBody(
	draft: SubscriptionDraft,
	form: SubscriptionForm,
	theirs: boolean
): SubscriptionInput {
	const value = Number(form.amount)
	const body: SubscriptionInput = {
		name: form.name.trim(),
		amount: cents(value),
		currency: form.currency,
		cycle: effectiveCycle(form),
		anchorDate: form.date,
		category: form.category,
		accountId:
			form.accountId === NO_SUBSCRIPTION_ACCOUNT ? null : form.accountId,
		merchantKey: draft.merchantKey ?? null,
		notes: form.notes.trim() || null,
	}
	if (theirs) {
		delete body.accountId
		delete body.merchantKey
	}
	return body
}

/** Options for the paid-from account select, led by a not-linked entry. */
export function subscriptionAccountItems(accounts: Account[]) {
	return [
		{ value: NO_SUBSCRIPTION_ACCOUNT, label: "Not linked" },
		...accounts.map((account) => ({
			value: account.id,
			label: `${account.name}${account.numberMasked ? ` · ${account.numberMasked}` : ""}`,
		})),
	]
}

/** Owns the subscription dialog's form state, validation and save request. */
export function useSubscriptionForm(
	draft: SubscriptionDraft | null,
	existing: Subscription | null | undefined,
	accounts: Account[],
	onClose: () => void,
	onSaved?: () => void
) {
	const [form, setForm] = useState<SubscriptionForm>(() =>
		formFromDraft({ cycle: "monthly" }, accounts)
	)
	const [saving, setSaving] = useState(false)
	const set = (patch: Partial<SubscriptionForm>) =>
		setForm((previousForm) => ({ ...previousForm, ...patch }))

	const [filledFrom, setFilledFrom] = useState<typeof draft>(null)
	if (draft !== filledFrom) {
		setFilledFrom(draft)
		if (draft) {
			setForm(formFromDraft(draft, accounts))
		}
	}

	const theirs = !!existing && existing.access !== "owner"
	const editing = !!draft?.id
	const valid = draft ? isSubscriptionFormValid(form) : false
	const unitMax =
		CYCLE_UNITS.find((unit) => unit.value === form.unit)?.max ?? 10
	const everyN = Number(form.every)
	const customValid =
		Number.isInteger(everyN) && everyN >= 1 && everyN <= unitMax

	async function save(event: React.FormEvent) {
		event.preventDefault()
		if (!draft || !valid) {
			return
		}
		setSaving(true)
		const body = subscriptionBody(draft, form, theirs)
		try {
			if (draft.id) {
				await api.updateSubscription(draft.id, body)
			} else {
				await api.createSubscription(body)
			}
			toast.success(
				editing ? "Subscription updated" : `Tracking ${body.name}`
			)
			onSaved?.()
			onClose()
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(false)
		}
	}

	return {
		form,
		set,
		saving,
		save,
		valid,
		editing,
		theirs,
		unitMax,
		customValid,
		decimalInput,
	}
}
