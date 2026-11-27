import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { PaymentMethodKind } from "@/lib/api"
import { METHOD_KINDS } from "@/lib/invoice"
import type { usePaymentMethodDialog } from "@/components/invoices/use-payment-method-dialog"

type DialogForm = ReturnType<typeof usePaymentMethodDialog>

/** Payment method dialog header and editable fields. */
export function PaymentMethodDialogForm({
	form,
	onClose,
}: {
	form: DialogForm
	onClose: () => void
}) {
	const { method } = form
	const kindItems = METHOD_KINDS.map((kindOption) => ({
		value: kindOption.kind,
		label: kindOption.label,
	}))

	return (
		<>
			<DialogHeader>
				<DialogTitle>
					{method ? "Edit payment method" : "Add a payment method"}
				</DialogTitle>
				<DialogDescription>
					How people can pay you. It shows on the PDF and the invoice
					page, with copy buttons and QR codes.
				</DialogDescription>
			</DialogHeader>
			<form
				className="grid gap-4"
				onSubmit={(event) => void form.save(event)}
			>
				<div className="grid gap-2">
					<Label>Type</Label>
					<Select
						items={kindItems}
						value={form.kind}
						onValueChange={(value) =>
							value && form.setKind(value as PaymentMethodKind)
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{METHOD_KINDS.map((kindOption) => (
								<SelectItem
									key={kindOption.kind}
									value={kindOption.kind}
								>
									<span className="flex flex-col">
										<span>{kindOption.label}</span>
										<span className="text-xs text-muted-foreground">
											{kindOption.hint}
										</span>
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="pm-label">Name on the invoice</Label>
					<Input
						id="pm-label"
						value={form.label}
						maxLength={60}
						onChange={(event) => form.setLabel(event.target.value)}
						placeholder={form.def.label}
					/>
				</div>

				<PaymentMethodKindFields form={form} />

				<label className="flex items-center gap-2 text-sm">
					<Checkbox
						checked={form.isDefault}
						onCheckedChange={(value) =>
							form.setIsDefault(value === true)
						}
					/>
					Tick it on new invoices
				</label>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" disabled={!form.valid || form.saving}>
						{form.saving && <Loader2 className="animate-spin" />}
						{method ? "Save" : "Add"}
					</Button>
				</DialogFooter>
			</form>
		</>
	)
}

function PaymentMethodKindFields({ form }: { form: DialogForm }) {
	if (form.checkout) {
		if (form.paypal.length) {
			return (
				<div className="grid gap-2">
					<Label>PayPal account that gets paid</Label>
					<Select
						items={form.paypal.map((preset) => ({
							value: preset.id,
							label: `${preset.label} (${preset.usernameMasked})`,
						}))}
						value={form.fieldsFor.connectionId ?? null}
						onValueChange={(value) =>
							value && form.setFields({ connectionId: value })
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Pick an account" />
						</SelectTrigger>
						<SelectContent>
							{form.paypal.map((preset) => (
								<SelectItem key={preset.id} value={preset.id}>
									{preset.label} ({preset.usernameMasked})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						Your client gets a “Pay with PayPal or card” button.
						Payments land in this account and the invoice is marked
						paid on its own.
					</p>
				</div>
			)
		}
		return (
			<p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
				Connect a PayPal account on Bank Accounts first (it uses your
				PayPal app’s client ID and secret). Until then, use the plain
				PayPal option with your PayPal.Me link.
			</p>
		)
	}

	return (
		<>
			{form.def.fields.map((file) => {
				const id = `pm-${file.key}`
				const Field = file.multiline ? Textarea : Input
				return (
					<div key={file.key} className="grid gap-2">
						<Label htmlFor={id}>
							{file.label}
							{!file.required &&
								form.def.fields.some(
									(field) => field.required
								) && (
									<span className="font-normal text-muted-foreground">
										{" "}
										(optional)
									</span>
								)}
						</Label>
						<Field
							id={id}
							value={form.fields[file.key] ?? ""}
							maxLength={500}
							placeholder={file.placeholder}
							onChange={(
								event: React.ChangeEvent<
									HTMLInputElement & HTMLTextAreaElement
								>
							) =>
								form.setFields((previous) => ({
									...previous,
									[previous.key]: event.target.value,
								}))
							}
						/>
					</div>
				)
			})}
		</>
	)
}
