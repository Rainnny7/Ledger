import { Field } from "@/components/invoices/editor/field"
import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

export function InvoiceEditorNotes({ model }: { model: InvoiceEditorModel }) {
  const { d, set } = model
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes & terms</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <Field id="inv-notes" label="Notes">
          <Textarea
            id="inv-notes"
            rows={3}
            maxLength={2000}
            value={d.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Thanks for your business!"
          />
        </Field>
        <Field id="inv-terms" label="Terms">
          <Textarea
            id="inv-terms"
            rows={3}
            maxLength={2000}
            value={d.terms ?? ""}
            onChange={(e) => set("terms", e.target.value)}
            placeholder="e.g. Payment due within 14 days."
          />
        </Field>
      </CardContent>
    </Card>
  )
}
