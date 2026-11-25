import { Fragment, type ReactNode } from "react"
import { ForeignMoney } from "@/components/common/money"
import type { Invoice } from "@/lib/api"
import { invoiceMoney } from "@/lib/invoice"

/** Sums per currency, so CAD and USD invoices never get added together. */
export function sumByCurrency(
	list: Invoice[],
	pick: (invoice: Invoice) => number
) {
	const totalsByCurrency = new Map<string, number>()
	for (const invoice of list) {
		totalsByCurrency.set(
			invoice.currency,
			(totalsByCurrency.get(invoice.currency) ?? 0) + pick(invoice)
		)
	}
	const parts = [...totalsByCurrency].filter(([, total]) => total > 0)
	if (!parts.length) {
		return invoiceMoney(0, list[0]?.currency ?? "CAD")
	}
	return parts.map(([currency, total], index) => (
		<Fragment key={currency}>
			{index > 0 && " + "}
			<ForeignMoney value={total} currency={currency}>
				{invoiceMoney(total, currency)}
			</ForeignMoney>
		</Fragment>
	)) as ReactNode
}
