import type { InvoiceEditorModel } from "@/components/invoices/editor/use-invoice-editor"
import { Field } from "@/components/invoices/editor/field"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "cn"

export function InvoiceEditorBillTo({ model }: { model: InvoiceEditorModel }) {
  const { d, set, setParty, clients, showMore, setShowMore } = model
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill to</CardTitle>
        {clients.length > 0 && (
          <CardDescription>
            Or pick someone you’ve billed before.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        {clients.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clients.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => set("client", c)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
                  d.client.name === c.name &&
                    "border-primary bg-primary/10 text-primary"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="client-name" label="Name or company">
            <Input
              id="client-name"
              value={d.client.name}
              maxLength={120}
              onChange={(e) => setParty("client", { name: e.target.value })}
              placeholder="Who you’re billing"
            />
          </Field>
          <Field id="client-email" label="Email">
            <Input
              id="client-email"
              type="email"
              value={d.client.email}
              maxLength={200}
              onChange={(e) => setParty("client", { email: e.target.value })}
              placeholder="For sending it (optional)"
            />
          </Field>
        </div>
        <Field id="client-address" label="Address">
          <Textarea
            id="client-address"
            rows={2}
            value={d.client.address}
            maxLength={400}
            onChange={(e) => setParty("client", { address: e.target.value })}
            placeholder="Optional"
          />
        </Field>
        {showMore ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="client-phone" label="Phone">
              <Input
                id="client-phone"
                value={d.client.phone}
                maxLength={50}
                onChange={(e) => setParty("client", { phone: e.target.value })}
              />
            </Field>
            <Field id="client-tax" label="Tax / business number">
              <Input
                id="client-tax"
                value={d.client.taxId}
                maxLength={60}
                onChange={(e) => setParty("client", { taxId: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          <button
            type="button"
            className="justify-self-start text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowMore(true)}
          >
            + Phone or tax number
          </button>
        )}
      </CardContent>
    </Card>
  )
}
