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
import { Checkbox } from "@/components/ui/checkbox"
import { methodKind, methodLines } from "@/lib/invoice"
import { cn } from "cn"
import { Plus } from "lucide-react"

/** React/UI entry: `InvoiceEditorMethods`. */
export function InvoiceEditorMethods({ model }: { model: InvoiceEditorModel }) {
	const { data, draft, setDraftField, selectedMethodIds, setMethodDialog } =
		model
	return (
		<Card>
			<CardHeader>
				<CardTitle>How they can pay</CardTitle>
				<CardDescription>
					Shown on the PDF and the invoice page with copy buttons and
					QR codes.
				</CardDescription>
				<CardAction>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setMethodDialog({ method: null })}
					>
						<Plus /> Add
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent>
				{data.methods.length === 0 ? (
					<button
						type="button"
						onClick={() => setMethodDialog({ method: null })}
						className="w-full rounded-lg border border-dashed p-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50"
					>
						Add e-Transfer, PayPal, crypto, a bank account or
						anything else. It’s saved for next time.
					</button>
				) : (
					<div className="grid gap-2 sm:grid-cols-2">
						{data.methods.map((method) => {
							const on = selectedMethodIds.has(method.id)
							return (
								<label
									key={method.id}
									className={cn(
										"flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40",
										on && "border-primary/60 bg-primary/5"
									)}
								>
									<Checkbox
										checked={on}
										onCheckedChange={(checked) =>
											setDraftField(
												"methodIds",
												checked
													? [
															...draft.methodIds,
															method.id,
														]
													: draft.methodIds.filter(
															(id) =>
																id !== method.id
														)
											)
										}
										className="mt-0.5"
									/>
									<span className="min-w-0">
										<span className="block truncate text-sm font-medium">
											{method.label}
										</span>
										<span className="block truncate text-xs text-muted-foreground">
											{method.kind === "paypal-checkout"
												? "Pay with PayPal or card · marked paid automatically"
												: methodLines(method)
														.map(
															(line) => line.value
														)
														.join(" · ") ||
													methodKind(method.kind)
														.label}
										</span>
									</span>
								</label>
							)
						})}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
