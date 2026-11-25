import { notifyFailure } from "@/components/invoices/notify"
import {
	recentClients,
	toItems,
	type Draft,
	type ItemDraft,
} from "@/components/invoices/editor/draft"
import { invoiceState } from "@/components/invoices/invoice-state"
import {
	api,
	type Invoice,
	type InvoiceInput,
	type InvoiceParty,
	type InvoicesData,
	type PaymentMethod,
} from "@/lib/api"
import { DEMO_READ_ONLY, demoMode } from "@/lib/demo"
import { addDays } from "@/lib/format"
import { invoiceMoney, shareUrl } from "@/lib/invoice"
import { invoiceTotals } from "../../../../shared/invoice.ts"
import type { InvoicePdfSource } from "@/lib/invoice-pdf-data"
import { confirmDialog } from "@/lib/confirm"
import { URL_OPTIONS } from "@/lib/url-state"
import { useQueryState } from "nuqs"
import { useEffect, useMemo, useRef, useState } from "react"
import { useBlocker, useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

/**
 * Invoice editor state, validation, save/send flow, and unsaved-navigation guards.
 */
export function useInvoiceEditor({
	data,
	saved,
	initial,
}: {
	data: InvoicesData
	saved: Invoice | null
	initial: Draft
}) {
	const navigate = useNavigate()
	const [draft, setDraft] = useState<Draft>(initial)
	const [saving, setSaving] = useState<"save" | "send" | null>(null)
	const [sharing, setSharing] = useState(false)
	const [methodDialog, setMethodDialog] = useState<{
		method: PaymentMethod | null
	} | null>(null)
	const [showFrom, setShowFrom] = useState(!initial.from.name)
	const [showMore, setShowMore] = useState(
		!!(initial.client.phone || initial.client.taxId)
	)
	const [dirty, setDirtyState] = useState(false)
	const dirtyRef = useRef(false)
	const setDirty = (value: boolean) => {
		dirtyRef.current = value
		setDirtyState(value)
	}

	const setDraftField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
		setDraft((previous) => ({ ...previous, [key]: value }))
		setDirty(true)
	}
	const setParty = (
		partyKey: "from" | "client",
		patch: Partial<InvoiceParty>
	) => {
		setDraft((previous) => ({
			...previous,
			[partyKey]: { ...previous[partyKey], ...patch },
		}))
		setDirty(true)
	}
	const setItem = (key: number, patch: Partial<ItemDraft>) => {
		setDraft((previous) => ({
			...previous,
			items: previous.items.map((item) =>
				item.key === key ? { ...item, ...patch } : item
			),
		}))
		setDirty(true)
	}

	const items = toItems(draft.items)
	const totals = invoiceTotals({
		items,
		taxRate: draft.taxRate,
		discount: draft.discount,
	})
	const paid = saved?.paid ?? 0
	const money = (amount: number) => invoiceMoney(amount, draft.currency)
	const methodById = useMemo(
		() => new Map(data.methods.map((method) => [method.id, method])),
		[data.methods]
	)
	const selectedMethodIds = useMemo(
		() => new Set(draft.methodIds),
		[draft.methodIds]
	)
	const chosen = draft.methodIds
		.map((methodId) => methodById.get(methodId))
		.filter((method): method is PaymentMethod => !!method)
	const clients = recentClients(data.invoices)

	const valid =
		draft.number.trim() &&
		items.length > 0 &&
		items.every((item) => item.description) &&
		/^\d{4}-\d{2}-\d{2}$/.test(draft.issueDate)

	const source: InvoicePdfSource = {
		invoice: { ...draft, items },
		methods: chosen,
		paid,
		url: saved ? shareUrl(saved.token) : null,
	}

	async function save(then: "stay" | "send") {
		if (demoMode) {
			return toast.error(DEMO_READ_ONLY)
		}
		if (!valid) {
			return toast.error(
				items.length
					? "Every line item needs a description."
					: "Add at least one line item."
			)
		}
		setSaving(then === "send" ? "send" : "save")
		const body: InvoiceInput = {
			...draft,
			number: draft.number.trim(),
			items,
			notes: draft.notes?.trim() || null,
			terms: draft.terms?.trim() || null,
			taxLabel: draft.taxLabel.trim() || "Tax",
		}
		try {
			const { invoice } = saved
				? await api.updateInvoice(saved.id, body)
				: await api.createInvoice(body)
			setDirty(false)
			if (!saved) {
				navigate({
					href: `/invoices/${invoice.id}${then === "send" ? "?send=1" : ""}`,
					replace: true,
				})
			} else if (then === "send") {
				setSharing(true)
			}
			if (then === "stay") {
				toast.success(
					saved ? "Invoice saved" : `Invoice ${invoice.number} saved`
				)
			}
		} catch (error) {
			notifyFailure(error)
		} finally {
			setSaving(null)
		}
	}

	const [send, setSend] = useQueryState("send", URL_OPTIONS)
	const shareOpen = sharing || (!!saved && !!send)
	function closeShare() {
		setSharing(false)
		if (send) {
			void setSend(null)
		}
	}

	useEffect(() => {
		if (!dirty || demoMode) {
			return
		}
		const warn = (event: BeforeUnloadEvent) => event.preventDefault()
		window.addEventListener("beforeunload", warn)
		return () => window.removeEventListener("beforeunload", warn)
	}, [dirty])
	const blocker = useBlocker({
		shouldBlockFn: ({ current, next }) =>
			!demoMode && dirtyRef.current && current.pathname !== next.pathname,
		withResolver: true,
	})
	useEffect(() => {
		if (blocker.status !== "blocked") {
			return
		}
		void confirmDialog({
			title: "Leave without saving?",
			description: "Your changes to this invoice haven’t been saved.",
			action: "Leave",
			destructive: true,
		}).then((leave) => (leave ? blocker.proceed() : blocker.reset()))
	}, [blocker])

	const state = saved ? invoiceState(saved) : null
	const liveSaved = saved
		? (data.invoices.find((invoice) => invoice.id === saved.id) ?? saved)
		: null
	const dueDays = draft.dueDate
		? Math.round(
				(Date.parse(draft.dueDate) - Date.parse(draft.issueDate)) /
					86_400_000
			)
		: 0

	const onIssueDate = (issueDateValue: string) => {
		setDraft((previous) => ({
			...previous,
			issueDate: issueDateValue,
			dueDate:
				previous.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(issueDateValue)
					? addDays(issueDateValue, dueDays)
					: previous.dueDate,
		}))
		setDirty(true)
	}

	return {
		draft,
		setDraftField,
		setParty,
		setItem,
		onIssueDate,
		items,
		totals,
		paid,
		money,
		methodById,
		selectedMethodIds,
		chosen,
		clients,
		valid,
		source,
		save,
		saving,
		dirty,
		showFrom,
		setShowFrom,
		showMore,
		setShowMore,
		methodDialog,
		setMethodDialog,
		shareOpen,
		closeShare,
		liveSaved,
		state,
		saved,
		dueDays,
		data,
		initial,
	}
}

/** Shape for `InvoiceEditorModel` used across this module. */
export type InvoiceEditorModel = ReturnType<typeof useInvoiceEditor>
