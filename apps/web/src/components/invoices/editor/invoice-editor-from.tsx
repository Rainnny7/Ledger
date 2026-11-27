import { Field } from "@/components/invoices/editor/field"
import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "cn"
import { ChevronDown } from "lucide-react"

/** React/UI entry: `InvoiceEditorFrom`. */
export function InvoiceEditorFrom({ model }: { model: InvoiceEditorModel }) {
	const { draft, setParty, showFrom, setShowFrom } = model
	return (
		<Card>
			<CardHeader>
				<CardTitle>Your Details</CardTitle>
				<CardDescription>
					{draft.from.name
						? `${draft.from.name} · remembered for every invoice`
						: "Who the invoice is from. Remembered for next time."}
				</CardDescription>
				<CardAction>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowFrom((show) => !show)}
						aria-expanded={showFrom}
					>
						{showFrom ? "Hide" : "Edit"}
						<ChevronDown
							className={cn(
								"transition-transform",
								showFrom && "rotate-180"
							)}
						/>
					</Button>
				</CardAction>
			</CardHeader>
			{showFrom && (
				<CardContent className="grid gap-3">
					<div className="grid gap-3 sm:grid-cols-2">
						<Field id="from-name" label="Your name or business">
							<Input
								id="from-name"
								value={draft.from.name}
								maxLength={120}
								onChange={(event) =>
									setParty("from", {
										name: event.target.value,
									})
								}
							/>
						</Field>
						<Field id="from-email" label="Email">
							<Input
								id="from-email"
								type="email"
								value={draft.from.email}
								maxLength={200}
								onChange={(event) =>
									setParty("from", {
										email: event.target.value,
									})
								}
							/>
						</Field>
						<Field id="from-phone" label="Phone">
							<Input
								id="from-phone"
								value={draft.from.phone}
								maxLength={50}
								onChange={(event) =>
									setParty("from", {
										phone: event.target.value,
									})
								}
							/>
						</Field>
						<Field id="from-tax" label="Tax number (GST/HST, VAT…)">
							<Input
								id="from-tax"
								value={draft.from.taxId}
								maxLength={60}
								onChange={(event) =>
									setParty("from", {
										taxId: event.target.value,
									})
								}
							/>
						</Field>
					</div>
					<Field id="from-address" label="Address">
						<Textarea
							id="from-address"
							rows={2}
							value={draft.from.address}
							maxLength={400}
							onChange={(event) =>
								setParty("from", {
									address: event.target.value,
								})
							}
						/>
					</Field>
				</CardContent>
			)}
		</Card>
	)
}
