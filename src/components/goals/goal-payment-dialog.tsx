import { DatePicker } from "@/components/common/date-picker"
import { Money } from "@/components/common/money"
import { Loader2, Minus, Plus } from "lucide-react"
import { accentStyle } from "@/components/goals/goal-meta"
import {
  decimalInput,
  type PaymentDraft,
  usePaymentForm,
} from "@/components/goals/goal-form"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { isoDate } from "@/lib/format"

export function GoalPaymentDialog({
  draft,
  onClose,
}: {
  draft: PaymentDraft | null
  onClose: () => void
}) {
  const {
    goal,
    direction,
    setDirection,
    amount,
    setAmount,
    date,
    setDate,
    note,
    setNote,
    valid,
    saving,
    save,
    preview,
    quick,
    payoff,
  } = usePaymentForm(draft, onClose)

  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{payoff ? "Log a payment" : "Add to goal"}</DialogTitle>
          <DialogDescription>
            {goal && (
              <>
                {goal.name} ·{" "}
                <Money value={goal.saved} currency={goal.currency} /> of{" "}
                <Money value={goal.target} currency={goal.currency} />
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={(e) => void save(e)}>
          <ToggleGroup
            value={[direction]}
            onValueChange={(v) => v[0] && setDirection(v[0] as "in" | "out")}
            variant="outline"
            className="w-full"
          >
            <ToggleGroupItem value="in" className="flex-1">
              <Plus /> {payoff ? "Payment" : "Deposit"}
            </ToggleGroupItem>
            <ToggleGroupItem value="out" className="flex-1">
              <Minus /> {payoff ? "Correction" : "Withdraw"}
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="pay-amount">Amount</Label>
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(decimalInput(e.target.value))}
              placeholder="50"
              className="h-11 text-lg tabular-nums"
              required
              autoFocus
            />
            {direction === "in" && quick.length > 0 && (
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
                    <Money value={q.value} currency={goal?.currency} />
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="pay-date">Date</Label>
              <DatePicker
                id="pay-date"
                value={date}
                max={isoDate()}
                onChange={setDate}
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="pay-note">Note</Label>
              <Input
                id="pay-note"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Birthday money"
              />
            </div>
          </div>

          {goal && valid && (
            <div className="grid animate-in gap-1.5 rounded-lg border bg-muted/40 p-3 text-sm duration-200 fade-in-0">
              <div className="flex justify-between">
                <span className="text-muted-foreground">After this</span>
                <span className="font-medium tabular-nums">
                  <Money value={preview.after} currency={goal.currency} /> ·{" "}
                  {preview.pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${preview.pct}%`,
                    ...accentStyle(goal.color),
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || saving}>
              {saving && <Loader2 className="animate-spin" />}
              {direction === "in"
                ? payoff
                  ? "Log payment"
                  : "Add"
                : "Take out"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
