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

export function InvoiceEditorFrom({ model }: { model: InvoiceEditorModel }) {
  const { d, setParty, showFrom, setShowFrom } = model
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your details</CardTitle>
        <CardDescription>
          {d.from.name
            ? `${d.from.name} · remembered for every invoice`
            : "Who the invoice is from. Remembered for next time."}
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFrom((s) => !s)}
            aria-expanded={showFrom}
          >
            {showFrom ? "Hide" : "Edit"}
            <ChevronDown
              className={cn("transition-transform", showFrom && "rotate-180")}
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
                value={d.from.name}
                maxLength={120}
                onChange={(e) => setParty("from", { name: e.target.value })}
              />
            </Field>
            <Field id="from-email" label="Email">
              <Input
                id="from-email"
                type="email"
                value={d.from.email}
                maxLength={200}
                onChange={(e) => setParty("from", { email: e.target.value })}
              />
            </Field>
            <Field id="from-phone" label="Phone">
              <Input
                id="from-phone"
                value={d.from.phone}
                maxLength={50}
                onChange={(e) => setParty("from", { phone: e.target.value })}
              />
            </Field>
            <Field id="from-tax" label="Tax number (GST/HST, VAT…)">
              <Input
                id="from-tax"
                value={d.from.taxId}
                maxLength={60}
                onChange={(e) => setParty("from", { taxId: e.target.value })}
              />
            </Field>
          </div>
          <Field id="from-address" label="Address">
            <Textarea
              id="from-address"
              rows={2}
              value={d.from.address}
              maxLength={400}
              onChange={(e) => setParty("from", { address: e.target.value })}
            />
          </Field>
        </CardContent>
      )}
    </Card>
  )
}
