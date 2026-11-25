import { DatePicker } from "@/components/common/date-picker"
import { CurrencySelect } from "@/components/common/currency-select"
import type { useWorkPaymentDialog } from "@/components/work/dialogs/use-work-payment-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney, isoDate } from "@/lib/format"

type Model = ReturnType<typeof useWorkPaymentDialog>

export function PaymentDialogFx({ model }: { model: Model }) {
  const {
    job,
    date,
    setDate,
    note,
    setNote,
    converted,
    setConverted,
    received,
    setReceived,
    receivedCurrency,
    setReceivedCurrency,
    value,
    receivedN,
    estimate,
  } = model

  return (
    <>
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
              onChange={(e) => setReceived(e.target.value)}
              placeholder={estimate !== null ? estimate.toFixed(2) : "0.00"}
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
    </>
  )
}
