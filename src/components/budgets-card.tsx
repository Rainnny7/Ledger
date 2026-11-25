import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CategoryIcon } from "@/components/tx-bits"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Budget, type Category, type Transaction } from "@/lib/api"
import { CATEGORY_LIST, CATEGORY_META, NON_SPEND } from "@/lib/categories"
import type { Converter } from "@/lib/currency"
import { demoMode } from "@/lib/demo"
import { spendByCategory, startOfMonth } from "@/lib/finance"
import { formatMoney } from "@/lib/format"
import { useBudgets } from "@/lib/queries"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const BUDGETABLE = CATEGORY_LIST.filter((c) => !NON_SPEND.has(c))

/** How far through the month today is (0–1), to show whether spending is on pace. */
function monthProgress(today = new Date()) {
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return today.getDate() / days
}

/**
 * Monthly limits per category, with this month's spending against each. `transactions` must
 * already be in the home currency.
 */
export function BudgetsCard({
  transactions,
  converter,
  loading,
}: {
  transactions: Transaction[]
  converter: Converter
  loading: boolean
}) {
  const { data } = useBudgets()
  const [editing, setEditing] = useState<{ budget: Budget | null } | null>(null)
  const budgets = useMemo(() => data?.budgets ?? [], [data])

  const rows = useMemo(() => {
    const from = startOfMonth()
    const spent = new Map(
      spendByCategory(transactions.filter((t) => t.date >= from)).map((r) => [
        r.category,
        r.total,
      ])
    )
    return budgets
      .map((b) => {
        // Limits are kept in the currency they were set in; show them in today's home currency.
        const limit = converter.toOr(b.amount, b.currency)
        const used = spent.get(b.category) ?? 0
        return { budget: b, limit, used, ratio: limit > 0 ? used / limit : 0 }
      })
      .sort((a, b) => b.ratio - a.ratio)
  }, [budgets, transactions, converter])

  const now = useNow()
  const pace = monthProgress(now)
  const month = now.toLocaleDateString(undefined, { month: "long" })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budgets</CardTitle>
        <CardDescription>
          {month} so far · the line marks where you’d be at an even pace
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing({ budget: null })}
            disabled={budgets.length >= BUDGETABLE.length}
          >
            <Plus /> Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loading || !data ? (
          <Skeleton className="h-24" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <p>
              Set a monthly limit for groceries, eating out or anything else to
              see how you’re tracking.
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditing({ budget: null })}
            >
              <Plus /> Set a budget
            </Button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {rows.map(({ budget, limit, used, ratio }) => {
              const over = used > limit
              const ahead = !over && ratio > pace + 0.1
              const left = limit - used
              return (
                <li
                  key={budget.category}
                  className="group flex items-center gap-3"
                >
                  <CategoryIcon category={budget.category} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {CATEGORY_META[budget.category].label}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatMoney(used)} / {formatMoney(limit)}
                      </span>
                    </div>
                    <div
                      className="relative mt-1.5 h-2 rounded-full bg-muted"
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={limit}
                      aria-valuenow={used}
                      aria-label={`${CATEGORY_META[budget.category].label} budget`}
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-500",
                          over
                            ? "bg-destructive"
                            : ahead
                              ? "bg-amber-500"
                              : "bg-primary"
                        )}
                        style={{ width: `${Math.min(100, ratio * 100)}%` }}
                      />
                      <div
                        className="absolute inset-y-[-2px] w-px bg-foreground/40"
                        style={{ left: `${pace * 100}%` }}
                        aria-hidden
                      />
                    </div>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        over ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      {over
                        ? `${formatMoney(-left)} over`
                        : `${formatMoney(left)} left`}
                      {ahead && " · ahead of pace"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${CATEGORY_META[budget.category].label} budget`}
                    className="opacity-60 group-hover:opacity-100"
                    onClick={() => setEditing({ budget })}
                  >
                    <Pencil />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      {editing && (
        <BudgetDialog
          budget={editing.budget}
          taken={budgets.map((b) => b.category)}
          home={converter.home}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function BudgetDialog({
  budget,
  taken,
  home,
  onClose,
}: {
  budget: Budget | null
  taken: Category[]
  home: string
  onClose: () => void
}) {
  const free = BUDGETABLE.filter(
    (c) => c === budget?.category || !taken.includes(c)
  )
  const [category, setCategory] = useState<Category>(
    budget?.category ?? free[0] ?? "groceries"
  )
  const [amount, setAmount] = useState(budget ? String(budget.amount) : "")
  const [busy, setBusy] = useState(false)
  const value = Number(amount)
  const valid = amount.trim() !== "" && Number.isFinite(value) && value > 0
  const currency = budget?.currency ?? home
  const items = free.map((c) => ({ value: c, label: CATEGORY_META[c].label }))

  async function run(action: () => Promise<unknown>, message: string) {
    if (demoMode)
      return toast.error(
        "Demo mode is read-only. Exit demo mode to make changes."
      )
    setBusy(true)
    try {
      await action()
      toast.success(message)
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {budget
              ? `${CATEGORY_META[budget.category].label} budget`
              : "New budget"}
          </DialogTitle>
          <DialogDescription>
            A monthly limit. Refunds count against what you’ve spent.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid)
              void run(
                () => api.setBudget(category, value, currency),
                "Budget saved"
              )
          }}
        >
          {!budget && (
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select
                items={items}
                value={category}
                onValueChange={(v) => v && setCategory(v as Category)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="budget-amount">Per month ({currency})</Label>
            <Input
              id="budget-amount"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="500"
            />
          </div>
          <DialogFooter className="sm:justify-between">
            {budget ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.deleteBudget(budget.category),
                    "Budget removed"
                  )
                }
              >
                <Trash2 /> Remove
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || busy}>
                {busy && <Loader2 className="animate-spin" />}
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
