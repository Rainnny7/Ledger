import { Money } from "@/components/common/money"
import { AnimatedMoney } from "@/components/common/count-up"
import { Progress } from "@/components/ui/progress"
import type { Account } from "@/lib/api"
import { useSession } from "@/lib/auth-client"
import { useDemoPrefs } from "@/lib/demo"
import { formatMoney } from "@/lib/format"
import { cn } from "cn"
import { isDebtAccount, shownBalance } from "@/lib/balances"
export {
  isDebtAccount,
  overdraftAllowance,
  shownBalance,
  shownRunningBalance,
  signedBalance,
} from "@/lib/balances"

/**
 * Settings → Preferences: whether balances count the overdraft you can still draw on. On by default
 * (and in demo mode until changed there, for the demo session only).
 */
export function useIncludeOverdraft() {
  const { data } = useSession()
  const demo = useDemoPrefs()
  return (
    demo.includeOverdraft ??
    (data?.user as { includeOverdraft?: boolean | null } | undefined)
      ?.includeOverdraft ??
    true
  )
}

export function BalanceLabel({ account }: { account: Account }) {
  return <>{isDebtAccount(account) ? "Balance owing" : "Balance"}</>
}

export function BalanceValue({
  account,
  className,
}: {
  account: Account
  className?: string
}) {
  const value = shownBalance(account, useIncludeOverdraft())
  const negative = !isDebtAccount(account) && (value ?? 0) < 0
  return (
    <span
      className={cn("tabular-nums", negative && "text-destructive", className)}
    >
      {value === null ? (
        formatMoney(null)
      ) : (
        <AnimatedMoney value={value} currency={account.currency} />
      )}
    </span>
  )
}

/** Overdraft usage for chequing/savings accounts. Renders nothing when there's no overdraft info. */
export function OverdraftMeter({
  account,
  compact,
}: {
  account: Account
  compact?: boolean
}) {
  if (isDebtAccount(account)) return null
  const used = account.overdraftUsed ?? 0
  const limit = account.overdraftLimit
  if (!limit && used <= 0) return null

  const pct = limit ? Math.min(100, (used / limit) * 100) : 100
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Overdraft</span>
        <span
          className={cn(
            "tabular-nums",
            used > 0 ? "font-medium text-destructive" : "text-muted-foreground"
          )}
        >
          {used > 0 ? (
            <>
              <Money value={used} currency={account.currency} /> used
            </>
          ) : (
            "Not in use"
          )}
          {limit ? (
            <>
              {" "}
              · <Money value={limit} currency={account.currency} /> limit
            </>
          ) : null}
        </span>
      </div>
      {!compact || used > 0 ? (
        <Progress
          value={pct}
          className={cn(
            "h-1.5",
            used > 0 && "[&_[data-slot=progress-indicator]]:bg-destructive"
          )}
        />
      ) : null}
    </div>
  )
}

export function CreditMeter({ account }: { account: Account }) {
  if (account.type !== "credit") return null
  const limit =
    account.creditLimit ??
    (account.available !== null && account.balance !== null
      ? account.available + account.balance
      : null)
  if (!limit) return null
  const used = Math.max(0, account.balance ?? 0)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Credit used</span>
        <span className="text-muted-foreground tabular-nums">
          {Math.round((used / limit) * 100)}% of{" "}
          <Money value={limit} currency={account.currency} />
        </span>
      </div>
      <Progress value={Math.min(100, (used / limit) * 100)} className="h-1.5" />
    </div>
  )
}
