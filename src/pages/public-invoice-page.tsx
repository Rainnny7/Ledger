import { AppLoader } from "@/components/app-loader"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  QrCode as QrIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "react-router"
import { toast } from "sonner"
import { BrandMark } from "@/components/brand"
import { pdfFileName, renderPdf, saveBlob } from "@/components/invoice-bits"
import { QrCode } from "@/components/qr-code"
import { Button } from "@/components/ui/button"
import {
  publicApi,
  type PublicInvoice,
  type PublicPaymentMethod,
} from "@/lib/api"
import { daysFromToday, formatDate } from "@/lib/format"
import {
  formatQty,
  formatRate,
  invoiceMoney,
  lineAmount,
  methodLines,
  partyLines,
  payLink,
  qrValue,
} from "@/lib/invoice"
import { cn } from "@/lib/utils"
import { copyText } from "@/lib/work"

const key = (token: string) => ["public-invoice", token] as const

/** The page the person you billed opens: the invoice, the PDF, and every way to pay. No sign-in. */
export function PublicInvoicePage() {
  const { token = "" } = useParams()
  const [params, setParams] = useSearchParams()
  const client = useQueryClient()
  const { data, error, isPending } = useQuery({
    queryKey: key(token),
    queryFn: () => publicApi.invoice(token),
    retry: false,
  })
  const [capturing, setCapturing] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    document.title = data
      ? `Invoice ${data.invoice.number}${data.invoice.from.name ? ` · ${data.invoice.from.name}` : ""}`
      : "Invoice"
  }, [data])

  // Back from PayPal: ?paypal=return&token=<order id>, or ?paypal=cancel.
  useEffect(() => {
    const flow = params.get("paypal")
    if (!flow || handled.current) return
    handled.current = true
    const orderId = params.get("token")
    setParams({}, { replace: true })
    if (flow === "cancel")
      return void toast("PayPal payment cancelled", {
        description: "Nothing was charged.",
      })
    if (flow !== "return" || !orderId) return
    setCapturing(true)
    publicApi
      .capturePaypal(token, orderId)
      .then(({ invoice }) => {
        if (invoice) client.setQueryData(key(token), { invoice })
        toast.success("Payment received. Thank you!")
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setCapturing(false))
  }, [params, setParams, token, client])

  if (isPending)
    return (
      <Shell>
        <AppLoader />
      </Shell>
    )
  if (error || !data)
    return (
      <Shell>
        <div className="mx-auto max-w-md py-24 text-center">
          <p className="text-lg font-semibold">Invoice not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error?.message ??
              "This link is not valid any more. Ask the sender for a new one."}
          </p>
        </div>
      </Shell>
    )

  return (
    <Shell>
      <InvoiceView invoice={data.invoice} token={token} capturing={capturing} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/40">
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:py-12">
        {children}
      </main>
      <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-muted-foreground">
        <BrandMark className="size-5 rounded-md [&_svg]:size-3" /> Sent with
        Ledger
      </footer>
    </div>
  )
}

function InvoiceView({
  invoice: inv,
  token,
  capturing,
}: {
  invoice: PublicInvoice
  token: string
  capturing: boolean
}) {
  const [downloading, setDownloading] = useState(false)
  const money = (n: number) => invoiceMoney(n, inv.currency)
  const discount = Math.min(inv.discount, inv.subtotal)
  const paid = inv.payState === "paid"
  const isVoid = inv.status === "void"
  const overdue =
    !paid && !isVoid && inv.dueDate && daysFromToday(inv.dueDate) < 0
  const methods = inv.methods

  async function download() {
    setDownloading(true)
    try {
      const blob = await renderPdf({
        invoice: inv,
        methods,
        paid: inv.paid,
        url: window.location.origin + window.location.pathname,
      })
      saveBlob(blob, pdfFileName(inv))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      {/* ---------------------------------------------------------------- summary */}
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
            onClick={() => void download()}
            disabled={downloading}
          >
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
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

      {/* ---------------------------------------------------------------- how to pay */}
      {!paid && !isVoid && methods.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold">How to pay</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {methods.map((m) => (
              <MethodCard key={m.id} method={m} invoice={inv} token={token} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Please include “{inv.number}” with your payment so it’s matched to
            this invoice.
          </p>
        </section>
      )}

      {/* ---------------------------------------------------------------- the invoice */}
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
            {inv.notes && <Block label="Notes" text={inv.notes} />}
            {inv.terms && <Block label="Terms" text={inv.terms} />}
          </div>
        )}
      </section>
    </>
  )
}

function Party({
  label,
  party,
}: {
  label: string
  party: PublicInvoice["client"]
}) {
  return (
    <div className="grid content-start gap-0.5 text-sm">
      <span className="mb-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="font-medium">{party.name || "—"}</span>
      {partyLines(party).map((l, i) => (
        <span key={i} className="break-words text-muted-foreground">
          {l}
        </span>
      ))}
    </div>
  )
}

function Total({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4",
        strong
          ? "border-t pt-1.5 text-base font-semibold"
          : "text-muted-foreground"
      )}
    >
      <span>{label}</span>
      <span className={cn("tabular-nums", !strong && "text-foreground")}>
        {value}
      </span>
    </div>
  )
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  )
}

function CopyButton({ value, what }: { value: string; what: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Copy ${what}`}
      onClick={async () => {
        if (!(await copyText(value)))
          return toast.error("Couldn’t copy to the clipboard")
        setDone(true)
        toast.success(`${what} copied`)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? <Check /> : <Copy />}
    </Button>
  )
}

function MethodCard({
  method: m,
  invoice: inv,
  token,
}: {
  method: PublicPaymentMethod
  invoice: PublicInvoice
  token: string
}) {
  const [starting, setStarting] = useState(false)
  const [showQr, setShowQr] = useState(m.kind === "crypto")

  if (m.kind === "paypal-checkout") {
    async function start() {
      setStarting(true)
      try {
        const { url } = await publicApi.startPaypal(token)
        window.location.assign(url)
      } catch (e) {
        toast.error((e as Error).message)
        setStarting(false)
      }
    }
    return (
      <div className="grid content-start gap-3 rounded-xl border bg-card p-4 sm:col-span-2">
        <div>
          <p className="font-medium">{m.label}</p>
          <p className="text-sm text-muted-foreground">
            Pay securely with your PayPal account or a debit or credit card.
          </p>
        </div>
        <Button
          size="lg"
          className="bg-[#ffc439] text-[#111] hover:bg-[#f2ba36]"
          onClick={() => void start()}
          disabled={starting}
        >
          {starting && <Loader2 className="animate-spin" />}
          Pay {invoiceMoney(inv.balance, inv.currency)} with PayPal
        </Button>
      </div>
    )
  }

  const lines = methodLines(m)
  const link = payLink(m, inv.balance, inv.currency)
  const qr = qrValue(m, inv.balance, inv.currency)

  return (
    <div className="grid content-start gap-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{m.label}</p>
        {qr && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={showQr ? "Hide QR code" : "Show QR code"}
            aria-pressed={showQr}
            onClick={() => setShowQr((s) => !s)}
          >
            <QrIcon />
          </Button>
        )}
      </div>
      <dl className="grid gap-1 text-sm">
        {lines.map((l) => (
          <div key={l.label} className="flex min-w-0 items-center gap-2">
            <dt className="shrink-0 text-muted-foreground">{l.label}</dt>
            <dd className="min-w-0 flex-1 font-medium break-all whitespace-pre-wrap">
              {l.value}
            </dd>
            {l.copy && <CopyButton value={l.value} what={l.label} />}
          </div>
        ))}
      </dl>
      {showQr && qr && (
        <QrCode
          value={qr}
          label={`QR code for ${m.label}`}
          className="mt-1 size-36 rounded-lg p-1.5"
        />
      )}
      {link && (
        <Button
          variant="outline"
          size="sm"
          className="mt-1 justify-self-start"
          render={<a href={link} target="_blank" rel="noreferrer" />}
          nativeButton={false}
        >
          <ExternalLink /> Pay with {m.label}
        </Button>
      )}
    </div>
  )
}
