import { ForeignMoney } from "@/components/common/money"
import { mulMoney } from "@ledger/shared/money"
import {
	parseNumber,
	sanitizeDecimalInput,
	newItem,
} from "@/components/invoices/editor/draft"
import { TotalsRow } from "@/components/invoices/editor/field"
import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Plus, X } from "lucide-react"

function Shown({
	model,
	amount,
}: {
	model: InvoiceEditorModel
	amount: number
}) {
	return (
		<ForeignMoney value={amount} currency={model.draft.currency}>
			{model.money(amount)}
		</ForeignMoney>
	)
}

/** React/UI entry: `InvoiceEditorItems`. */
export function InvoiceEditorItems({ model }: { model: InvoiceEditorModel }) {
	const { draft, setDraftField, setItem, totals, paid, initial } = model
	return (
		<Card>
			<CardHeader>
				<CardTitle>What it’s for</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3">
				<div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6rem_2rem] gap-2 text-xs font-medium text-muted-foreground sm:grid">
					<span>Description</span>
					<span>Qty</span>
					<span>Rate</span>
					<span className="text-right">Amount</span>
					<span />
				</div>
				{draft.items.map((item, index) => (
					<div
						key={item.key}
						className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6rem_2rem] sm:items-center"
					>
						<Input
							aria-label={`Item ${index + 1} description`}
							value={item.description}
							maxLength={300}
							onChange={(event) =>
								setItem(item.key, {
									description: event.target.value,
								})
							}
							placeholder={
								index === 0
									? "e.g. Website design"
									: "Description"
							}
							autoFocus={
								index === 0 &&
								!item.description &&
								!!initial.client.name
							}
						/>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`Remove item ${index + 1}`}
							disabled={draft.items.length === 1}
							onClick={() =>
								setDraftField(
									"items",
									draft.items.filter(
										(row) => row.key !== item.key
									)
								)
							}
							className="sm:order-last"
						>
							<X />
						</Button>
						<div className="col-span-2 grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:contents">
							<Input
								aria-label="Quantity"
								inputMode="decimal"
								value={item.quantity}
								onChange={(event) =>
									setItem(item.key, {
										quantity: sanitizeDecimalInput(
											event.target.value
										),
									})
								}
							/>
							<Input
								aria-label="Rate"
								inputMode="decimal"
								value={item.unitPrice}
								onChange={(event) =>
									setItem(item.key, {
										unitPrice: sanitizeDecimalInput(
											event.target.value
										),
									})
								}
								placeholder="0.00"
							/>
							<span className="min-w-16 text-right text-sm tabular-nums">
								<Shown
									model={model}
									amount={mulMoney(
										parseNumber(item.unitPrice),
										parseNumber(item.quantity)
									)}
								/>
							</span>
						</div>
					</div>
				))}
				<Button
					variant="outline"
					size="sm"
					className="justify-self-start"
					onClick={() =>
						setDraftField("items", [...draft.items, newItem()])
					}
				>
					<Plus /> Add line
				</Button>

				<div className="mt-2 grid gap-2 border-t pt-3 text-sm">
					<TotalsRow
						label="Subtotal"
						value={<Shown model={model} amount={totals.subtotal} />}
					/>
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground">Discount</span>
						<Input
							aria-label="Discount"
							inputMode="decimal"
							className="h-8 w-28 text-right"
							value={draft.discount ? String(draft.discount) : ""}
							placeholder="0.00"
							onChange={(event) =>
								setDraftField(
									"discount",
									Math.max(
										0,
										parseNumber(
											sanitizeDecimalInput(
												event.target.value
											)
										)
									)
								)
							}
						/>
					</div>
					<div className="flex items-center justify-between gap-3">
						<span className="flex items-center gap-2 text-muted-foreground">
							<Input
								aria-label="Tax name"
								className="h-8 w-20"
								value={draft.taxLabel}
								maxLength={30}
								onChange={(event) =>
									setDraftField(
										"taxLabel",
										event.target.value
									)
								}
							/>
							<Input
								aria-label="Tax rate"
								inputMode="decimal"
								className="h-8 w-16 text-right"
								value={
									draft.taxRate ? String(draft.taxRate) : ""
								}
								placeholder="0"
								onChange={(event) =>
									setDraftField(
										"taxRate",
										Math.min(
											100,
											Math.max(
												0,
												parseNumber(
													sanitizeDecimalInput(
														event.target.value
													)
												)
											)
										)
									)
								}
							/>
							%
						</span>
						<span className="tabular-nums">
							<Shown model={model} amount={totals.tax} />
						</span>
					</div>
					<TotalsRow
						label="Total"
						value={<Shown model={model} amount={totals.total} />}
						strong
					/>
					{paid > 0 && (
						<TotalsRow
							label="Already paid"
							value={<Shown model={model} amount={-paid} />}
						/>
					)}
				</div>
			</CardContent>
		</Card>
	)
}
