import { useState } from "react"
import { toast } from "sonner"
import {
	api,
	type PaymentMethod,
	type PaymentMethodKind,
	type PaypalAppConnection,
} from "@/lib/api"
import { methodComplete, methodKind } from "@/lib/invoice"
import { notifyFailure } from "@/components/invoices/notify"

/** Options for {@link usePaymentMethodDialog}. */
type UsePaymentMethodDialogOptions = {
	open: boolean
	method: PaymentMethod | null
	paypal: PaypalAppConnection[]
	onClose: () => void
	onSaved?: (method: PaymentMethod) => void
}

/**
 * Form state, validation, and save handler for the payment method dialog.
 */
export function usePaymentMethodDialog({
	open,
	method,
	paypal,
	onClose,
	onSaved,
}: UsePaymentMethodDialogOptions) {
	const [kind, setKind] = useState<PaymentMethodKind>("etransfer")
	const [label, setLabel] = useState("")
	const [fields, setFields] = useState<Record<string, string>>({})
	const [isDefault, setIsDefault] = useState(true)
	const [saving, setSaving] = useState(false)

	const [shown, setShown] = useState<{
		open: boolean
		method: PaymentMethod | null
	}>({ open: false, method: null })
	if (open !== shown.open || method !== shown.method) {
		setShown({ open, method })
		if (open) {
			setKind(method?.kind ?? "etransfer")
			setLabel(method?.label ?? "")
			setFields(method?.fields ?? {})
			setIsDefault(method?.isDefault ?? true)
		}
	}

	const def = methodKind(kind)
	const checkout = kind === "paypal-checkout"
	const fieldsFor =
		checkout && paypal.length === 1 && !fields.connectionId
			? { connectionId: paypal[0]!.id }
			: fields
	const valid =
		methodComplete(kind, fieldsFor) &&
		(kind !== "link" || /^https:\/\//i.test(fieldsFor.url ?? ""))

	async function save(event: React.FormEvent) {
		event.preventDefault()
		if (!valid) {
			return
		}
		setSaving(true)
		const keys = checkout
			? ["connectionId"]
			: def.fields.map((file) => file.key)
		const body = {
			kind,
			label: label.trim() || def.label,
			fields: Object.fromEntries(
				keys
					.map((fieldKey) => [
						fieldKey,
						(fieldsFor[fieldKey] ?? "").trim(),
					])
					.filter(([, value]) => value)
			),
			isDefault,
		}
		try {
			if (method) {
				await api.updatePaymentMethod(method.id, body)
				onSaved?.({ ...body, id: method.id })
			} else {
				const { method: created } = await api.createPaymentMethod(body)
				onSaved?.(created)
			}
			toast.success(
				method ? "Payment method saved" : `Added ${body.label}`
			)
			onClose()
		} catch (error) {
			notifyFailure(error)
		} finally {
			setSaving(false)
		}
	}

	return {
		method,
		kind,
		setKind,
		label,
		setLabel,
		fields,
		setFields,
		isDefault,
		setIsDefault,
		saving,
		def,
		checkout,
		fieldsFor,
		valid,
		paypal,
		save,
	}
}
