import { Money } from "@/components/common/money"
import type { useWorkPaymentDialog } from "@/components/work/dialogs/use-work-payment-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Model = ReturnType<typeof useWorkPaymentDialog>

export function PaymentDialogAmount({ model }: { model: Model }) {
  const {
    job,
    open,
    invoiceId,
    setInvoiceId,
    amount,
    setAmountInput,
    setAmountQuick,
    items,
    quick,
  } = model

  return (
    <>
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
          onChange={(e) => setAmountInput(e.target.value)}
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
                onClick={() => setAmountQuick(String(q.value))}
              >
                {q.label} · <Money value={q.value} currency={job?.currency} />
              </Button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
