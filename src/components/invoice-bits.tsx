import { DatePicker } from "@/components/date-picker"
import { confirmDialog } from "@/components/confirm-dialog"
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Share2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  api,
  type Invoice,
  type PaymentMethod,
  type PaymentMethodKind,
  type PaypalAppConnection,
} from "@/lib/api"
import { daysFromToday, formatShortDate, isoDate } from "@/lib/format"
import {
  invoiceMoney,
  METHOD_KINDS,
  methodComplete,
  methodKind,
  round2,
  safeFileName,
  shareUrl,
} from "@/lib/invoice"
import type { InvoicePdfSource } from "@/lib/invoice-pdf"
import { cn } from "@/lib/utils"
import { copyText } from "@/lib/work"

export const fail = (err: unknown) => toast.error((err as Error).message)

/** The PDF renderer (WebAssembly + font) only downloads the first time a PDF is needed. */
export const renderPdf = (source: InvoicePdfSource) =>
  import("@/lib/invoice-pdf").then((m) => m.renderInvoicePdf(source))

/** Everything the PDF needs from a saved invoice. */
export function pdfSource(
  inv: Invoice,
  methods: PaymentMethod[]
): InvoicePdfSource {
  return {
    invoice: inv,
    methods: inv.methodIds
      .map((id) => methods.find((m) => m.id === id))
      .filter((m): m is PaymentMethod => !!m),
    paid: inv.paid,
    url: shareUrl(inv.token),
  }
}

export const pdfFileName = (inv: Pick<Invoice, "number" | "client">) =>
  `${safeFileName(["Invoice", inv.number, inv.client.name].filter(Boolean).join(" "))}.pdf`

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function copy(text: string, what: string) {
  if (await copyText(text)) toast.success(`${what} copied`)
  else toast.error("Couldn’t copy to the clipboard")
}

// ---------------------------------------------------------------- status

export type InvoiceState =
  | "draft"
  | "sent"
  | "viewed"
  | "overdue"
  | "partial"
  | "paid"
  | "void"

export function invoiceState(inv: Invoice): InvoiceState {
  if (inv.status === "void") return "void"
  if (inv.payState === "paid") return "paid"
  if (inv.status === "draft") return "draft"
  if (inv.dueDate && daysFromToday(inv.dueDate) < 0) return "overdue"
  if (inv.payState === "partial") return "partial"
  return inv.viewedAt ? "viewed" : "sent"
}

const STATE: Record<InvoiceState, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: {
    label: "Sent",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  viewed: {
    label: "Viewed",
    className: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
  overdue: {
    label: "Overdue",
    className: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  partial: {
    label: "Partly paid",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  void: {
    label: "Void",
    className: "bg-muted text-muted-foreground line-through",
  },
}

export function StateBadge({
  state,
  className,
}: {
  state: InvoiceState
  className?: string
}) {
  const s = STATE[state]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        s.className,
        className
      )}
    >
      {s.label}
    </span>
  )
}

// ---------------------------------------------------------------- share

/**
 * Send the invoice: copy the link, share the PDF through the phone's share sheet, email it, or download it.
 * Sharing a draft marks it as sent, since that's what you're doing.
 */
export function ShareDialog({
  invoice,
  methods,
  onClose,
}: {
  invoice: Invoice | null
  methods: PaymentMethod[]
  onClose: () => void
}) {
  const [busy, setBusy] = useState<"pdf" | "share" | "reset" | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => setCopied(false), [invoice?.id])

  if (!invoice) return null
  const inv = invoice
  const url = shareUrl(inv.token)
  const money = invoiceMoney(
    inv.balance > 0 ? inv.balance : inv.total,
    inv.currency
  )
  const from = inv.from.name || "me"
  const message = `Hi${inv.client.name ? ` ${inv.client.name}` : ""}, here's invoice ${inv.number} for ${money}${
    inv.dueDate ? `, due ${formatShortDate(inv.dueDate)}` : ""
  }. You can view it, download the PDF and pay here: ${url}`
  const canShareFiles = typeof navigator !== "undefined" && !!navigator.canShare

  async function markSent() {
    if (inv.status !== "draft") return
    try {
      await api.updateInvoice(inv.id, { status: "sent" })
    } catch {
      /* the share itself worked; the status can be set later */
    }
  }

  async function copyLink() {
    if (!(await copyText(url)))
      return toast.error("Couldn’t copy to the clipboard")
    setCopied(true)
    toast.success("Link copied", {
      description: "Anyone with this link can view and pay the invoice.",
    })
    void markSent()
  }

  async function sharePdf() {
    setBusy("share")
    try {
      const blob = await renderPdf(pdfSource(inv, methods))
      const file = new File([blob], pdfFileName(inv), {
        type: "application/pdf",
      })
      const data: ShareData = {
        title: `Invoice ${inv.number}`,
        text: message,
        files: [file],
      }
      if (navigator.canShare?.(data)) await navigator.share(data)
      else if (navigator.share)
        await navigator.share({ title: data.title, text: message, url })
      else return saveBlob(blob, file.name)
      void markSent()
    } catch (err) {
      if ((err as Error).name !== "AbortError") fail(err)
    } finally {
      setBusy(null)
    }
  }

  async function download() {
    setBusy("pdf")
    try {
      saveBlob(await renderPdf(pdfSource(inv, methods)), pdfFileName(inv))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  async function resetLink() {
    if (
      !(await confirmDialog({
        title: "Make a new link?",
        description:
          "The old one stops working, so anyone you sent it to will need the new one.",
        action: "Make new link",
      }))
    )
      return
    setBusy("reset")
    try {
      await api.resetInvoiceLink(inv.id)
      setCopied(false)
      toast.success("New link made")
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const mailto = `mailto:${encodeURIComponent(inv.client.email)}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${from}`)}&body=${encodeURIComponent(
    `${message}\n\nThanks!`
  )}`

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send invoice {inv.number}</DialogTitle>
          <DialogDescription>
            {inv.client.name
              ? `${inv.client.name} can`
              : "Whoever has the link can"}{" "}
            view it, download the PDF and see every way to pay.
            {inv.viewedAt &&
              ` Opened ${formatShortDate(inv.viewedAt.slice(0, 10))}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex gap-2">
            <Input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invoice link"
              className="font-mono text-xs"
            />
            <Button onClick={() => void copyLink()} className="shrink-0">
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void sharePdf()}
            >
              {busy === "share" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Share2 />
              )}
              {canShareFiles ? "Share PDF" : "Share"}
            </Button>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => void download()}
            >
              {busy === "pdf" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download />
              )}
              Download PDF
            </Button>
            <Button
              variant="outline"
              render={<a href={mailto} onClick={() => void markSent()} />}
              nativeButton={false}
            >
              <Mail /> Email
            </Button>
            <Button
              variant="outline"
              render={<a href={url} target="_blank" rel="noreferrer" />}
              nativeButton={false}
            >
              <ExternalLink /> Open page
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Email opens your mail app with the link filled in. To attach the
            PDF, download it first or use Share on your phone.
          </p>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => void resetLink()}
          >
            {busy === "reset" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            New link
          </Button>
          {inv.status === "draft" ? (
            <Button
              size="sm"
              onClick={() =>
                void api
                  .updateInvoice(inv.id, { status: "sent" })
                  .then(() => toast.success("Marked as sent"))
                  .catch(fail)
              }
            >
              <Send /> Mark as sent
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onClose}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- record a payment

export function RecordPaymentDialog({
  invoice,
  methods,
  onClose,
}: {
  invoice: Invoice | null
  methods: PaymentMethod[]
  onClose: () => void
}) {
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(isoDate())
  const [method, setMethod] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!invoice) return
    setAmount(invoice.balance > 0 ? String(invoice.balance) : "")
    setDate(isoDate())
    const offered = invoice.methodIds
      .map((id) => methods.find((m) => m.id === id))
      .filter(Boolean)
    setMethod(offered.length === 1 ? offered[0]!.label : "")
    setNote("")
  }, [invoice, methods])

  if (!invoice) return null
  const n = Number(amount)
  const valid = Number.isFinite(n) && n > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const labels = [...new Set(methods.map((m) => m.label))]

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!invoice || !valid) return
    setSaving(true)
    try {
      const { invoice: updated } = await api.addInvoicePayment(invoice.id, {
        amount: round2(n),
        date,
        method: method.trim() || null,
        note: note.trim() || null,
      })
      toast.success(
        updated.payState === "paid"
          ? `${invoice.number} is paid in full`
          : `Recorded ${invoiceMoney(n, invoice.currency)}`,
        {
          description:
            updated.payState === "paid"
              ? undefined
              : `${invoiceMoney(updated.balance, invoice.currency)} still owed`,
        }
      )
      onClose()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {invoice.number} · {invoiceMoney(invoice.balance, invoice.currency)}{" "}
            owed of {invoiceMoney(invoice.total, invoice.currency)}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="pay-amount">Amount ({invoice.currency})</Label>
              <Input
                id="pay-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d.]/g, ""))
                }
                autoFocus
                required
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="pay-date">Date</Label>
              <DatePicker
                id="pay-date"
                value={date}
                max={isoDate()}
                onChange={setDate}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pay-method">Paid by</Label>
            <Input
              id="pay-method"
              value={method}
              maxLength={60}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="e.g. e-Transfer"
              autoComplete="off"
            />
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {labels.slice(0, 6).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setMethod(l)}
                    className={cn(
                      "h-6 rounded-full border px-2.5 text-xs transition-colors hover:bg-muted",
                      method === l &&
                        "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pay-note">Note</Label>
            <Input
              id="pay-note"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- payment methods

/** Add or edit one way of getting paid. Saved methods can be ticked on any invoice. */
export function PaymentMethodDialog({
  open,
  method,
  paypal,
  onClose,
  onSaved,
}: {
  open: boolean
  method: PaymentMethod | null
  paypal: PaypalAppConnection[]
  onClose: () => void
  onSaved?: (m: PaymentMethod) => void
}) {
  const [kind, setKind] = useState<PaymentMethodKind>("etransfer")
  const [label, setLabel] = useState("")
  const [fields, setFields] = useState<Record<string, string>>({})
  const [isDefault, setIsDefault] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(method?.kind ?? "etransfer")
    setLabel(method?.label ?? "")
    setFields(method?.fields ?? {})
    setIsDefault(method?.isDefault ?? true)
  }, [open, method])

  const def = methodKind(kind)
  const checkout = kind === "paypal-checkout"
  const fieldsFor =
    checkout && paypal.length === 1 && !fields.connectionId
      ? { connectionId: paypal[0]!.id }
      : fields
  const valid =
    methodComplete(kind, fieldsFor) &&
    (kind !== "link" || /^https:\/\//i.test(fieldsFor.url ?? ""))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const keys = checkout ? ["connectionId"] : def.fields.map((f) => f.key)
    const body = {
      kind,
      label: label.trim() || def.label,
      fields: Object.fromEntries(
        keys.map((k) => [k, (fieldsFor[k] ?? "").trim()]).filter(([, v]) => v)
      ),
      isDefault,
    }
    try {
      if (method) {
        await api.updatePaymentMethod(method.id, body)
        onSaved?.({ ...body, id: method.id })
      } else {
        const { method: created } = await api.createPaymentMethod(body)
        onSaved?.(created)
      }
      toast.success(method ? "Payment method saved" : `Added ${body.label}`)
      onClose()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  const kindItems = METHOD_KINDS.map((k) => ({ value: k.kind, label: k.label }))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {method ? "Edit payment method" : "Add a payment method"}
          </DialogTitle>
          <DialogDescription>
            How people can pay you. It shows on the PDF and the invoice page,
            with copy buttons and QR codes.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              items={kindItems}
              value={kind}
              onValueChange={(v) => v && setKind(v as PaymentMethodKind)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHOD_KINDS.map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>
                    <span className="flex flex-col">
                      <span>{k.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {k.hint}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pm-label">Name on the invoice</Label>
            <Input
              id="pm-label"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={def.label}
            />
          </div>

          {checkout ? (
            paypal.length ? (
              <div className="grid gap-2">
                <Label>PayPal account that gets paid</Label>
                <Select
                  items={paypal.map((p) => ({
                    value: p.id,
                    label: `${p.label} (${p.usernameMasked})`,
                  }))}
                  value={fieldsFor.connectionId ?? null}
                  onValueChange={(v) => v && setFields({ connectionId: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {paypal.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label} ({p.usernameMasked})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Your client gets a “Pay with PayPal or card” button. Payments
                  land in this account and the invoice is marked paid on its
                  own.
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Connect a PayPal account on Bank Accounts first (it uses your
                PayPal app’s client ID and secret). Until then, use the plain
                PayPal option with your PayPal.Me link.
              </p>
            )
          ) : (
            def.fields.map((f) => {
              const id = `pm-${f.key}`
              const Field = f.multiline ? Textarea : Input
              return (
                <div key={f.key} className="grid gap-2">
                  <Label htmlFor={id}>
                    {f.label}
                    {!f.required && def.fields.some((x) => x.required) && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        (optional)
                      </span>
                    )}
                  </Label>
                  <Field
                    id={id}
                    value={fields[f.key] ?? ""}
                    maxLength={500}
                    placeholder={f.placeholder}
                    onChange={(
                      e: React.ChangeEvent<
                        HTMLInputElement & HTMLTextAreaElement
                      >
                    ) => setFields((x) => ({ ...x, [f.key]: e.target.value }))}
                  />
                </div>
              )
            })
          )}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
            />
            Tick it on new invoices
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {method ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
