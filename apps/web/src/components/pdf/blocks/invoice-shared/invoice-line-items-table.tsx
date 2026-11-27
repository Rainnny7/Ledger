import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/pdf/table/table"
import type { InvoicePdfData } from "@/components/pdf/blocks/invoice-shared/invoice-data"
import { invoicePdfLineKey } from "@/components/pdf/blocks/invoice-shared/invoice-pdf-line-key"
import type { TableVariant } from "@/components/pdf/table/table.types"

type InvoiceLineItemsTableProps = {
	items: InvoicePdfData["items"]
	variant?: TableVariant
	rateAlign?: "center" | "right"
}

/** Shared line-item table used by minimal and modern invoice layouts. */
export function InvoiceLineItemsTable({
	items,
	variant = "compact",
	rateAlign = "right",
}: InvoiceLineItemsTableProps) {
	return (
		<Table variant={variant}>
			<TableHeader>
				<TableRow header>
					<TableCell>Description</TableCell>
					<TableCell align="center">Qty</TableCell>
					<TableCell align={rateAlign}>Rate</TableCell>
					<TableCell align="right">Total</TableCell>
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map((item, itemIndex) => (
					<TableRow key={invoicePdfLineKey(item, itemIndex)}>
						<TableCell>{item.description}</TableCell>
						<TableCell align="center">{item.quantity}</TableCell>
						<TableCell align={rateAlign}>
							{item.unitPrice}
						</TableCell>
						<TableCell align="right">{item.amount}</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}
