import { Money } from '@/components/money'
import { AnimatedMoney } from '@/components/count-up'
import { Progress } from '@/components/ui/progress'
import type { Account, Transaction } from '@/lib/api'
import { useSession } from '@/lib/auth-client'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

export function isDebtAccount(a: Pick<Account, 'type'>) {
  return a.type === 'credit' || a.type === 'loan'
}

/**
 * Settings → Preferences: whether balances count the overdraft you can still draw on. On by default
 * (and in demo mode, where nobody is signed in).
 */
export function useIncludeOverdraft() {
  const { data } = useSession()
  return (data?.user as { includeOverdraft?: boolean | null } | undefined)?.includeOverdraft ?? true
}

/** The overdraft a chequing/savings account comes with: its limit, or failing that available − balance. */
export function overdraftAllowance(a: Pick<Account, 'type' | 'balance' | 'available' | 'overdraftLimit'>) {
  if (isDebtAccount(a)) return 0
  if (a.overdraftLimit) return a.overdraftLimit
  if (a.available === null || a.balance === null) return 0
  return Math.max(0, Math.round((a.available - a.balance) * 100) / 100)
}

/** The balance to show for an account, with its overdraft added when that preference is on. */
export function shownBalance(a: Account, includeOverdraft: boolean) {
  if (a.balance === null) return null
  return includeOverdraft ? a.balance + overdraftAllowance(a) : a.balance
}

/** Value that counts toward net worth: debts subtract. */
export function signedBalance(a: Account, includeOverdraft = false) {
  if (a.balance === null) return 0
  return isDebtAccount(a) ? -Math.abs(a.balance) : (shownBalance(a, includeOverdraft) ?? 0)
}

/** A transaction's balance-after, on the same basis as the account's balance. */
export function shownRunningBalance(t: Pick<Transaction, 'runningBalance'>, account: Account | undefined, includeOverdraft: boolean) {
  if (t.runningBalance === null) return null
  return includeOverdraft && account ? t.runningBalance + overdraftAllowance(account) : t.runningBalance
}

export function BalanceLabel({ account }: { account: Account }) {
  return <>{isDebtAccount(account) ? 'Balance owing' : 'Balance'}</>
}

export function BalanceValue({ account, className }: { account: Account; className?: string }) {
  const value = shownBalance(account, useIncludeOverdraft())
  const negative = !isDebtAccount(account) && (value ?? 0) < 0
  return (
    <span className={cn('tabular-nums', negative && 'text-destructive', className)}>
      {value === null ? formatMoney(null) : <AnimatedMoney value={value} currency={account.currency} />}
    </span>
  )
}

/** Overdraft usage for chequing/savings accounts. Renders nothing when there's no overdraft info. */
export function OverdraftMeter({ account, compact }: { account: Account; compact?: boolean }) {
  if (isDebtAccount(account)) return null
  const used = account.overdraftUsed ?? 0
  const limit = account.overdraftLimit
  if (!limit && used <= 0) return null

  const pct = limit ? Math.min(100, (used / limit) * 100) : 100
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Overdraft</span>
        <span className={cn('tabular-nums', used > 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
          {used > 0 ? `${formatMoney(used, account.currency)} used` : 'Not in use'}
          {limit ? ` · ${formatMoney(limit, account.currency)} limit` : ''}
        </span>
      </div>
      {!compact || used > 0 ? (
        <Progress value={pct} className={cn('h-1.5', used > 0 && '[&_[data-slot=progress-indicator]]:bg-destructive')} />
      ) : null}
    </div>
  )
}

export function CreditMeter({ account }: { account: Account }) {
  if (account.type !== 'credit') return null
  const limit = account.creditLimit ?? (account.available !== null && account.balance !== null ? account.available + account.balance : null)
  if (!limit) return null
  const used = Math.max(0, account.balance ?? 0)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">Credit used</span>
        <span className="tabular-nums text-muted-foreground">
          {Math.round((used / limit) * 100)}% of <Money value={limit} currency={account.currency} />
        </span>
      </div>
      <Progress value={Math.min(100, (used / limit) * 100)} className="h-1.5" />
    </div>
  )
}
