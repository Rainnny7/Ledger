import { CheckCircle2, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PublicInvoice } from "@/lib/api"
import { daysFromToday, formatDate } from "@/lib/format"
import { formatQty, formatRate, invoiceMoney, lineAmount } from "@/lib/invoice"
import { cn } from "cn"
import { pdfFileName } from "@/components/invoices/pdf-files"
import { usePdfDownload } from "@/components/invoices/use-pdf-download"
import { PublicMethodCard } from "@/components/invoices/public/method-card"
import {
  Party,
  TextBlock,
  Total,
} from "@/components/invoices/public/layout-bits"

export function PublicInvoiceView({
  invoice: inv,
  token,
  capturing,
}: {
  invoice: PublicInvoice
  token: string
  capturing: boolean
}) {
  const downloadPdf = usePdfDownload()
  const money = (n: number) => invoiceMoney(n, inv.currency)
  const discount = Math.min(inv.discount, inv.subtotal)
  const paid = inv.payState === "paid"
  const isVoid = inv.status === "void"
  const overdue =
    !paid && !isVoid && inv.dueDate && daysFromToday(inv.dueDate) < 0
  const methods = inv.methods

  return (
    <>
      <section className="grid gap-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              Invoice {inv.number}
            </p>
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {inv.from.name || "Invoice"}
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              downloadPdf.mutate({
                source: {
                  invoice: inv,
                  methods,
                  paid: inv.paid,
                  url: window.location.origin + window.location.pathname,
                },
                name: pdfFileName(inv),
              })
            }
            disabled={downloadPdf.isPending}
          >
            {downloadPdf.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            Download PDF
          </Button>
        </div>

        <div className="grid gap-1">
          <p className="text-sm text-muted-foreground">
            {paid
              ? "Paid in full"
              : isVoid
                ? "Cancelled"
                : inv.paid > 0
                  ? "Balance due"
                  : "Amount due"}
          </p>
          <p
            className={cn(
              "text-4xl font-semibold tracking-tight tabular-nums",
              (paid || isVoid) && "text-muted-foreground"
            )}
          >
            {money(paid ? inv.total : inv.balance)}
          </p>
          <p
            className={cn(
              "text-sm",
              overdue
                ? "font-medium text-red-600 dark:text-red-400"
                : "text-muted-foreground"
            )}
          >
            {paid ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4" /> Thank you, this invoice is
                paid.
              </span>
            ) : isVoid ? (
              "This invoice was cancelled. Nothing is owed."
            ) : inv.dueDate ? (
              `${overdue ? "Was due" : "Due"} ${formatDate(inv.dueDate)}`
            ) : (
              "Due on receipt"
            )}
          </p>
        </div>

        {capturing && (
          <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
            <Loader2 className="size-4 animate-spin" /> Finishing your PayPal
            payment…
          </p>
        )}
      </section>

      {!paid && !isVoid && methods.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold">How to pay</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {methods.map((m) => (
              <PublicMethodCard
                key={m.id}
                method={m}
                invoice={inv}
                token={token}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Please include “{inv.number}” with your payment so it’s matched to
            this invoice.
          </p>
        </section>
      )}

      <section className="grid gap-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <Party label="From" party={inv.from} />
          <Party label="Bill to" party={inv.client} />
          <div className="grid content-start gap-1 text-sm">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Details
            </span>
            <span>Issued {formatDate(inv.issueDate)}</span>
            <span>
              {inv.dueDate
                ? `Due ${formatDate(inv.dueDate)}`
                : "Due on receipt"}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="py-2 pr-3 text-right font-medium">Qty</th>
                <th className="py-2 pr-3 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((i, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-2.5 pr-3">{i.description}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {formatQty(i.quantity)}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {money(i.unitPrice)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {money(lineAmount(i))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto grid w-full max-w-xs gap-1.5 text-sm">
          <Total label="Subtotal" value={money(inv.subtotal)} />
          {discount > 0 && <Total label="Discount" value={money(-discount)} />}
          {inv.taxRate > 0 && (
            <Total
              label={`${inv.taxLabel} (${formatRate(inv.taxRate)})`}
              value={money(inv.tax)}
            />
          )}
          <Total
            label="Total"
            value={money(inv.total)}
            strong={inv.paid === 0}
          />
          {inv.paid !== 0 && (
            <>
              <Total label="Paid" value={money(-inv.paid)} />
              <Total label="Balance due" value={money(inv.balance)} strong />
            </>
          )}
        </div>

        {(inv.notes || inv.terms) && (
          <div className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
            {inv.notes && <TextBlock label="Notes" text={inv.notes} />}
            {inv.terms && <TextBlock label="Terms" text={inv.terms} />}
          </div>
        )}
      </section>
    </>
  )
}
