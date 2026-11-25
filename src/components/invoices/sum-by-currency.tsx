import { Fragment, type ReactNode } from "react"
import { ForeignMoney } from "@/components/common/money"
import type { Invoice } from "@/lib/api"
import { invoiceMoney } from "@/lib/invoice"

/** Sums per currency, so CAD and USD invoices never get added together. */
export function sumByCurrency(list: Invoice[], pick: (i: Invoice) => number) {
  const by = new Map<string, number>()
  for (const i of list) by.set(i.currency, (by.get(i.currency) ?? 0) + pick(i))
  const parts = [...by].filter(([, n]) => n > 0)
  if (!parts.length) return invoiceMoney(0, list[0]?.currency ?? "CAD")
  return parts.map(([c, n], i) => (
    <Fragment key={c}>
      {i > 0 && " + "}
      <ForeignMoney value={n} currency={c}>
        {invoiceMoney(n, c)}
      </ForeignMoney>
    </Fragment>
  )) as ReactNode
}
