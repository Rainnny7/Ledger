import { Money } from "@/components/common/money"
import { shownRunningBalance } from "@/components/accounts/account-figures"
import type { Account, Transaction } from "@/lib/api"
import { formatLongDate, formatTimestamp } from "@/lib/format"

export function TransactionSheetDetails({
  t,
  account,
  includeOverdraft,
}: {
  t: Transaction
  account: Account | undefined
  includeOverdraft: boolean
}) {
  const currency = account?.currency ?? "CAD"
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
      <dt className="text-muted-foreground">Description</dt>
      <dd className="font-mono text-xs break-all">{t.description}</dd>
      <dt className="text-muted-foreground">
        {t.pending ? "Authorized" : "Posted"}
      </dt>
      <dd>{formatLongDate(t.date)}</dd>
      {t.runningBalance !== null && (
        <>
          <dt className="text-muted-foreground">Balance after</dt>
          <dd className="tabular-nums">
            <Money
              value={shownRunningBalance(t, account, includeOverdraft)}
              currency={currency}
            />
          </dd>
        </>
      )}
      <dt className="text-muted-foreground">Account</dt>
      <dd>
        {account?.name}
        {account?.numberMasked ? ` · ${account.numberMasked}` : ""}
      </dd>
      <dt className="text-muted-foreground">First synced</dt>
      <dd>{formatTimestamp(t.createdAt)}</dd>
    </dl>
  )
}
