import { DatePicker } from "@/components/common/date-picker"
import { CurrencySelect } from "@/components/common/currency-select"
import { DUE_PRESETS } from "@/components/invoices/editor/draft"
import { Field } from "@/components/invoices/editor/field"
import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addDays } from "@/lib/format"
import { cn } from "cn"

export function InvoiceEditorDetails({ model }: { model: InvoiceEditorModel }) {
  const { d, set, onIssueDate, dueDays } = model
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field id="inv-number" label="Invoice no.">
            <Input
              id="inv-number"
              value={d.number}
              maxLength={40}
              onChange={(e) => set("number", e.target.value)}
            />
          </Field>
          <Field id="inv-date" label="Issued">
            <DatePicker
              id="inv-date"
              value={d.issueDate}
              onChange={onIssueDate}
            />
          </Field>
          <Field id="inv-currency" label="Currency">
            <CurrencySelect
              id="inv-currency"
              value={d.currency}
              onChange={(v) => set("currency", v)}
            />
          </Field>
        </div>
        <div className="grid gap-2">
          <Label>Due</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {DUE_PRESETS.map((p) => {
              const active =
                p.days === 0 ? !d.dueDate : d.dueDate && dueDays === p.days
              return (
                <button
                  key={p.days}
                  type="button"
                  onClick={() =>
                    set(
                      "dueDate",
                      p.days === 0 ? null : addDays(d.issueDate, p.days)
                    )
                  }
                  className={cn(
                    "h-8 rounded-lg border px-3 text-sm transition-colors hover:bg-muted",
                    active &&
                      "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                  )}
                >
                  {p.label}
                </button>
              )
            })}
            <DatePicker
              aria-label="Due date"
              placeholder="Due date"
              className="w-44"
              value={d.dueDate ?? ""}
              min={d.issueDate}
              clearable
              onChange={(v) => set("dueDate", v || null)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
