import { Money } from "@/components/common/money"
import { useIncludeOverdraft } from "@/components/accounts/account-figures"
import type { PaymentDraft } from "@/components/goals/goal-form"
import { GoalPaymentDialog } from "@/components/goals/goal-payment-dialog"
import { CategoryIcon, RelativeDate } from "@/components/transactions/tx-bits"
import { CategorySelect } from "@/components/transactions/category-select"
import { TransactionSheetActions } from "@/components/transactions/transaction-sheet-actions"
import { TransactionSheetDetails } from "@/components/transactions/transaction-sheet-details"
import { TransactionSheetHistory } from "@/components/transactions/transaction-sheet-history"
import { useTransactionForm } from "@/components/transactions/use-transaction-form"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { Account, TaxTag, Transaction } from "@/lib/api"
import { TAX_TAG_LIST, TAX_TAG_META } from "@/lib/categories"
import { useGoals, useSubscriptions } from "@/lib/queries"
import { cn } from "cn"
import { useState } from "react"

interface Props {
  transaction: Transaction | null
  transactions: Transaction[]
  accounts: Account[]
  onClose: () => void
  onUpdated: (tx: Transaction, merchantWide: boolean) => void
  onSelect: (tx: Transaction) => void
}

export function TransactionSheet({
  transaction: t,
  transactions,
  accounts,
  onClose,
  onUpdated,
  onSelect,
}: Props) {
  const [paying, setPaying] = useState<PaymentDraft | null>(null)
  const form = useTransactionForm(t, transactions, onUpdated)
  const goals = useGoals().data?.goals
  const openGoals = (goals ?? []).filter(
    (g) => !g.archived && g.status !== "done" && g.access !== "view"
  )
  const linked = t
    ? (goals ?? []).filter((g) =>
        g.payments.some((p) => p.transactionId === t.id)
      )
    : []
  const subs = (useSubscriptions().data?.subscriptions ?? []).filter(
    (s) => s.access === "owner"
  )
  const countedFor = t
    ? subs.find((s) => s.payments.some((p) => p.id === t.id))
    : undefined
  const countedByHand =
    !!t && !!countedFor?.payments.find((p) => p.id === t.id)?.linked

  const account = accounts.find((a) => a.id === t?.accountId)
  const includeOverdraft = useIncludeOverdraft()
  const currency = account?.currency ?? "CAD"

  return (
    <>
      <GoalPaymentDialog draft={paying} onClose={() => setPaying(null)} />
      <Sheet open={!!t} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md!">
          {t && form.history && (
            <>
              <SheetHeader className="gap-3 pb-0">
                <div className="flex items-center gap-3 pr-8">
                  <CategoryIcon category={t.category} className="size-10" />
                  <div className="min-w-0">
                    <SheetTitle className="truncate text-base">
                      {t.merchant}
                    </SheetTitle>
                    <SheetDescription className="truncate">
                      {account?.name}
                    </SheetDescription>
                  </div>
                </div>
                <div>
                  <div
                    className={cn(
                      "text-3xl font-semibold tracking-tight tabular-nums",
                      t.amount > 0 && "text-emerald-600 dark:text-emerald-400"
                    )}
                  >
                    <Money value={t.amount} currency={currency} sign />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <RelativeDate date={t.date} seenAt={t.createdAt} />
                    {t.pending && <Badge variant="outline">Pending</Badge>}
                  </div>
                </div>
              </SheetHeader>

              <div className="grid gap-5 px-4 pb-6">
                <TransactionSheetDetails
                  t={t}
                  account={account}
                  includeOverdraft={includeOverdraft}
                />

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Category</Label>
                    {t.categorySource !== "auto" && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                        onClick={() => void form.resetCategory()}
                      >
                        Reset to automatic
                      </button>
                    )}
                  </div>
                  <CategorySelect
                    value={form.category}
                    onChange={form.setCategory}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.applyAll}
                      onCheckedChange={(v) => form.setApplyAll(v === true)}
                    />
                    Always use this for {t.merchant} ({form.history.count})
                  </label>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>For taxes</Label>
                    {t.taxTagSource === "auto" && (
                      <span className="text-xs text-muted-foreground">
                        A payment for one of your bills
                      </span>
                    )}
                  </div>
                  <Tabs
                    value={form.taxTag}
                    onValueChange={(v) => form.setTaxTag(v as TaxTag | "none")}
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="none">Untagged</TabsTrigger>
                      {TAX_TAG_LIST.map((tag) => {
                        const Icon = TAX_TAG_META[tag].icon
                        return (
                          <TabsTrigger
                            key={tag}
                            value={tag}
                            title={TAX_TAG_META[tag].hint}
                          >
                            <Icon /> {TAX_TAG_META[tag].label}
                          </TabsTrigger>
                        )
                      })}
                    </TabsList>
                  </Tabs>
                  {(form.taxTag !== "none" || t.taxTagSource === "rule") && (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.taxAll}
                        onCheckedChange={(v) => form.setTaxAll(v === true)}
                      />
                      Always tag {t.merchant} this way ({form.history.count})
                    </label>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="tx-note">Note</Label>
                  <Textarea
                    id="tx-note"
                    placeholder={
                      form.taxTag === "business"
                        ? "What was it for? e.g. software for client work, lunch with a client…"
                        : "Add a note — e.g. split with Sam, reimbursable…"
                    }
                    value={form.note}
                    maxLength={500}
                    onChange={(e) => form.setNote(e.target.value)}
                  />
                </div>

                <TransactionSheetActions
                  t={t}
                  openGoals={openGoals}
                  subs={subs}
                  countedFor={countedFor}
                  countedByHand={countedByHand}
                  dirty={form.dirty}
                  saving={form.saving}
                  onSave={form.save}
                  onPayGoal={setPaying}
                  linked={linked}
                />

                <Separator />

                <TransactionSheetHistory
                  merchant={t.merchant}
                  history={form.history}
                  currency={currency}
                  currentId={t.id}
                  onSelect={onSelect}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
