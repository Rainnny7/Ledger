import { DatePicker } from "@/components/date-picker"
import { Money } from "@/components/money"
import { Copy, Loader2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CurrencySelect } from "@/components/currency-select"
import { accentStyle } from "@/components/goal-bits"
import { Button } from "@/components/ui/button"
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
import { api, type WorkJob } from "@/lib/api"
import { convertAmount, useFx } from "@/lib/currency"
import {
  formatMoney,
  formatShortDate,
  getDisplayCurrency,
  isoDate,
} from "@/lib/format"
import { copyText, paymentLine } from "@/lib/work"
import { fail, money, round2, validDate } from "@/components/work-form"

export interface WorkPaymentDraft {
  job: WorkJob
  invoiceId?: string
  amount?: number
  date?: string
  note?: string
  transactionId?: string
}

export function WorkPaymentDialog({
  draft,
  onClose,
}: {
  draft: WorkPaymentDraft | null
  onClose: () => void
}) {
  const job = draft?.job
  const open = useMemo(
    () =>
      job ? job.invoices.filter((i) => i.status !== "paid").reverse() : [],
    [job]
  )
  const [invoiceId, setInvoiceId] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState(isoDate())
  const [note, setNote] = useState("")
  // Paid in one currency, landed in another (billed in USD, deposited as CAD): what actually arrived.
  const [converted, setConverted] = useState(false)
  const [received, setReceived] = useState("")
  const [receivedCurrency, setReceivedCurrency] = useState(getDisplayCurrency)
  const [saving, setSaving] = useState(false)
  const fx = useFx()
  const invoice =
    open.find((i) => i.id === invoiceId) ??
    job?.invoices.find((i) => i.id === invoiceId)

  // Fill the form from each new draft, during render so the old values never flash.
  const [filledFrom, setFilledFrom] = useState<typeof draft>(null)
  if (draft !== filledFrom) {
    setFilledFrom(draft)
    if (draft) {
      const target =
        draft.job.invoices.find((i) => i.id === draft.invoiceId) ??
        draft.job.invoices.filter((i) => i.status !== "paid").at(-1)
      setInvoiceId(target?.id ?? "")
      const usual =
        draft.job.payAmount && target
          ? Math.min(draft.job.payAmount, target.remaining)
          : target?.remaining
      setAmount(
        draft.amount
          ? String(Math.abs(draft.amount))
          : usual
            ? String(usual)
            : ""
      )
      setDate(draft.date ?? isoDate())
      setNote(draft.note ?? "")
      const home = getDisplayCurrency()
      setConverted(draft.job.currency !== home)
      setReceived("")
      setReceivedCurrency(
        home !== draft.job.currency
          ? home
          : draft.job.currency === "USD"
            ? "CAD"
            : "USD"
      )
    }
  }

  const value = Number(amount)
  const receivedN = Number(received)
  const receivedValid =
    !converted || !received || (Number.isFinite(receivedN) && receivedN > 0)
  const estimate =
    job && value > 0
      ? convertAmount(value, job.currency, receivedCurrency, fx)
      : null
  const valid =
    !!invoice &&
    Number.isFinite(value) &&
    value > 0 &&
    validDate(date) &&
    receivedValid
  const after = invoice ? round2(invoice.remaining - (value || 0)) : 0
  const items = open.map((i) => ({
    value: i.id,
    label: `${formatShortDate(i.date)} · ${formatMoney(i.remaining, job?.currency)} left of ${formatMoney(i.total, job?.currency)}`,
  }))
  const quick = invoice
    ? [
        job?.payAmount &&
          job.payAmount < invoice.remaining && {
            label: "Usual",
            value: job.payAmount,
          },
        { label: "The rest", value: invoice.remaining },
      ].filter((q): q is { label: string; value: number } => !!q && q.value > 0)
    : []

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!job || !invoice || !valid) return
    setSaving(true)
    try {
      const before = new Set(invoice.payments.map((p) => p.id))
      const { job: updated } = await api.addWorkPayment(invoice.id, {
        amount: round2(value),
        date,
        note: note.trim() || null,
        transactionId: draft?.transactionId ?? null,
        ...(converted && receivedN > 0 && receivedCurrency !== job.currency
          ? { receivedAmount: round2(receivedN), receivedCurrency }
          : {}),
      })
      const inv = updated.invoices.find((i) => i.id === invoice.id)
      const added = inv?.payments.find((p) => !before.has(p.id))
      const line = added ? paymentLine(added, job.currency) : null
      const cleared = inv?.status === "paid"
      toast.success(
        cleared
          ? `🎉 Bill cleared — ${formatMoney(inv.total, job.currency)} paid in full`
          : `${formatMoney(value, job.currency)} received`,
        {
          description: cleared
            ? undefined
            : `${formatMoney(inv?.remaining ?? 0, job.currency)} left on this bill`,
          duration: 8000,
          action: line
            ? {
                label: (
                  <span className="flex items-center gap-1">
                    <Copy className="size-3" /> Copy update
                  </span>
                ),
                onClick: () =>
                  void copyText(line).then((ok) =>
                    ok
                      ? toast.success("Copied", { description: line })
                      : toast.error("Couldn’t copy")
                  ),
              }
            : undefined,
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
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {job && (
              <>
                {job.name} · <Money value={job.owed} currency={job.currency} />{" "}
                owed
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing’s owed right now. Bill some hours first.
          </p>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => void save(e)}>
            {open.length > 1 && (
              <div className="grid min-w-0 gap-2">
                <Label>Toward</Label>
                <Select
                  items={items}
                  value={invoiceId}
                  onValueChange={(v) => v && setInvoiceId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.value} value={i.value}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid min-w-0 gap-2">
              <Label htmlFor="wp-amount">Amount</Label>
              <Input
                id="wp-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(money(e.target.value))}
                placeholder="0.00"
                className="h-11 text-lg tabular-nums"
                required
                autoFocus
              />
              {quick.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {quick.map((q) => (
                    <Button
                      key={q.label}
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={() => setAmount(String(q.value))}
                    >
                      {q.label} ·{" "}
                      <Money value={q.value} currency={job?.currency} />
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="wp-date">Date</Label>
                <DatePicker
                  id="wp-date"
                  value={date}
                  max={isoDate()}
                  onChange={setDate}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="wp-note">Note</Label>
                <Input
                  id="wp-note"
                  value={note}
                  maxLength={300}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e-Transfer"
                />
              </div>
            </div>

            {converted ? (
              <div className="grid min-w-0 animate-in gap-2 duration-200 fade-in-0 slide-in-from-top-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wp-received">Landed in your account as</Label>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setConverted(false)}
                  >
                    Same currency
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
                  <Input
                    id="wp-received"
                    inputMode="decimal"
                    value={received}
                    onChange={(e) => setReceived(money(e.target.value))}
                    placeholder={
                      estimate !== null ? estimate.toFixed(2) : "0.00"
                    }
                    className="tabular-nums"
                  />
                  <CurrencySelect
                    id="wp-received-currency"
                    value={receivedCurrency}
                    onChange={setReceivedCurrency}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {receivedN > 0 && value > 0 && job
                    ? `1 ${job.currency} = ${(receivedN / value).toFixed(4)} ${receivedCurrency} after fees and conversion`
                    : estimate !== null && job
                      ? `About ${formatMoney(estimate, receivedCurrency)} at today’s rate. Optional — enter what the bank shows.`
                      : "Optional — enter what the bank shows."}
                </p>
              </div>
            ) : (
              <button
                type="button"
                className="justify-self-start text-xs font-medium text-primary hover:underline"
                onClick={() => setConverted(true)}
              >
                Arrived in another currency?
              </button>
            )}

            {invoice && valid && (
              <div className="grid animate-in gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm duration-200 fade-in-0">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">After this</span>
                  <span className="font-medium tabular-nums">
                    {after <= 0.005 ? (
                      "Paid off"
                    ) : (
                      <>
                        <Money value={after} currency={job?.currency} />{" "}
                        remaining
                      </>
                    )}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, ((invoice.total - Math.max(0, after)) / (invoice.total || 1)) * 100)}%`,
                      ...accentStyle(job!.color),
                    }}
                  />
                </div>
                {after < -0.005 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    That’s <Money value={-after} currency={job?.currency} />{" "}
                    more than this bill needs.
                  </p>
                )}
              </div>
            )}

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
        )}
      </DialogContent>
    </Dialog>
  )
}
