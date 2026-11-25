import { Money } from "@/components/common/money"
import {
  BalanceLabel,
  BalanceValue,
  CreditMeter,
  isDebtAccount,
  OverdraftMeter,
} from "@/components/accounts/account-figures"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Account } from "@/lib/api"

export function AccountStatCards({ account: a }: { account: Account }) {
  const debt = isDebtAccount(a)
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card size="sm">
        <CardHeader>
          <CardDescription>
            <BalanceLabel account={a} />
          </CardDescription>
          <CardTitle className="text-2xl! font-semibold">
            <BalanceValue account={a} />
          </CardTitle>
        </CardHeader>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardDescription>
            {a.type === "credit" ? "Available credit" : "Available"}
          </CardDescription>
          <CardTitle className="text-2xl! font-semibold tabular-nums">
            <Money value={a.available} currency={a.currency} />
          </CardTitle>
        </CardHeader>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardDescription>
            {debt ? "Credit limit" : "Overdraft"}
          </CardDescription>
          <CardTitle className="text-2xl! font-semibold tabular-nums">
            {debt ? (
              <Money
                value={
                  a.creditLimit ??
                  (a.available !== null && a.balance !== null
                    ? a.available + a.balance
                    : null)
                }
                currency={a.currency}
              />
            ) : (a.overdraftUsed ?? 0) > 0 ? (
              <span className="text-destructive">
                <Money value={a.overdraftUsed} currency={a.currency} />
              </span>
            ) : a.overdraftLimit ? (
              "Not in use"
            ) : (
              "None"
            )}
          </CardTitle>
        </CardHeader>
        {(debt
          ? a.type === "credit"
          : a.overdraftLimit || (a.overdraftUsed ?? 0) > 0) && (
          <CardContent>
            {debt ? (
              <CreditMeter account={a} />
            ) : (
              <OverdraftMeter account={a} />
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
