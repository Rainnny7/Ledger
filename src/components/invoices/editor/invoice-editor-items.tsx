import { ForeignMoney } from "@/components/common/money"
import { mulMoney } from "../../../../shared/money.ts"
import { decimal, newItem, num } from "@/components/invoices/editor/draft"
import { TotalsRow } from "@/components/invoices/editor/field"
import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Plus, X } from "lucide-react"

function Shown({ model, n }: { model: InvoiceEditorModel; n: number }) {
  return (
    <ForeignMoney value={n} currency={model.d.currency}>
      {model.money(n)}
    </ForeignMoney>
  )
}

export function InvoiceEditorItems({ model }: { model: InvoiceEditorModel }) {
  const { d, set, setItem, totals, paid, initial } = model
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
        {d.items.map((it, idx) => (
          <div
            key={it.key}
            className="grid grid-cols-[minmax(0,1fr)_2rem] gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_6rem_2rem] sm:items-center"
          >
            <Input
              aria-label={`Item ${idx + 1} description`}
              value={it.description}
              maxLength={300}
              onChange={(e) => setItem(it.key, { description: e.target.value })}
              placeholder={idx === 0 ? "e.g. Website design" : "Description"}
              autoFocus={idx === 0 && !it.description && !!initial.client.name}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove item ${idx + 1}`}
              disabled={d.items.length === 1}
              onClick={() =>
                set(
                  "items",
                  d.items.filter((x) => x.key !== it.key)
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
                value={it.quantity}
                onChange={(e) =>
                  setItem(it.key, { quantity: decimal(e.target.value) })
                }
              />
              <Input
                aria-label="Rate"
                inputMode="decimal"
                value={it.unitPrice}
                onChange={(e) =>
                  setItem(it.key, { unitPrice: decimal(e.target.value) })
                }
                placeholder="0.00"
              />
              <span className="min-w-16 text-right text-sm tabular-nums">
                <Shown
                  model={model}
                  n={mulMoney(num(it.unitPrice), num(it.quantity))}
                />
              </span>
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => set("items", [...d.items, newItem()])}
        >
          <Plus /> Add line
        </Button>

        <div className="mt-2 grid gap-2 border-t pt-3 text-sm">
          <TotalsRow
            label="Subtotal"
            value={<Shown model={model} n={totals.subtotal} />}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Discount</span>
            <Input
              aria-label="Discount"
              inputMode="decimal"
              className="h-8 w-28 text-right"
              value={d.discount ? String(d.discount) : ""}
              placeholder="0.00"
              onChange={(e) =>
                set("discount", Math.max(0, num(decimal(e.target.value))))
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Input
                aria-label="Tax name"
                className="h-8 w-20"
                value={d.taxLabel}
                maxLength={30}
                onChange={(e) => set("taxLabel", e.target.value)}
              />
              <Input
                aria-label="Tax rate"
                inputMode="decimal"
                className="h-8 w-16 text-right"
                value={d.taxRate ? String(d.taxRate) : ""}
                placeholder="0"
                onChange={(e) =>
                  set(
                    "taxRate",
                    Math.min(100, Math.max(0, num(decimal(e.target.value))))
                  )
                }
              />
              %
            </span>
            <span className="tabular-nums">
              <Shown model={model} n={totals.tax} />
            </span>
          </div>
          <TotalsRow
            label="Total"
            value={<Shown model={model} n={totals.total} />}
            strong
          />
          {paid > 0 && (
            <TotalsRow
              label="Already paid"
              value={<Shown model={model} n={-paid} />}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
