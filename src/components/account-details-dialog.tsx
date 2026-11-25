import { Hint } from '@/components/hint'
import { Check, Copy, Eye, EyeOff, Landmark, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import type { Account } from '@/lib/api'
import { formatMoney, formatRelative } from '@/lib/format'
import { useAccountDetails } from '@/lib/queries'

/** "Direct deposit & limits": institution / transit / account number plus TD's daily limits. */
export function AccountDetailsButton({
  account,
  size = 'sm',
  variant = 'outline',
  className,
  labelClassName,
}: {
  account: Account
  size?: 'sm' | 'xs'
  variant?: 'outline' | 'ghost' | 'secondary'
  className?: string
  /** Lets a tight spot hide the words and keep just the icon (the button stays labelled either way). */
  labelClassName?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Hint label="Direct deposit & limits">
        <Button
          variant={variant}
          size={size}
          className={className}
          aria-label="Direct deposit & limits"
          onClick={() => setOpen(true)}
        >
          <Landmark /> <span className={labelClassName}>Direct deposit & limits</span>
        </Button>
      </Hint>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Direct deposit & limits</DialogTitle>
            <DialogDescription className="truncate">{account.name}</DialogDescription>
          </DialogHeader>
          {open && <DetailsBody account={account} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function DetailsBody({ account: a }: { account: Account }) {
  const { data, loading, error } = useAccountDetails(a.id, true)
  const [revealed, setRevealed] = useState(false)

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  const d = data?.details
  const limits = [
    ...(a.overdraftLimit ? [{ label: 'Overdraft limit', value: formatMoney(a.overdraftLimit, a.currency) }] : []),
    ...(a.creditLimit ? [{ label: 'Credit limit', value: formatMoney(a.creditLimit, a.currency) }] : []),
    ...(d?.limits ?? []).map((l) => ({ label: l.label, value: l.amount !== null ? formatMoney(l.amount, a.currency) : (l.text ?? '—') })),
  ]
  const hasNumbers = !!(d?.accountNumber || d?.transit)

  return (
    <div className="grid min-w-0 gap-4">
      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Direct deposit</h3>
          {hasNumbers && (
            <Button variant="ghost" size="sm" onClick={() => setRevealed((r) => !r)}>
              {revealed ? <EyeOff /> : <Eye />} {revealed ? 'Hide' : 'Show'}
            </Button>
          )}
        </div>
        {hasNumbers ? (
          <dl className="grid gap-1.5 rounded-lg border p-3 text-sm">
            <Row label="Institution" value={d?.institution} revealed />
            <Row label="Transit" value={d?.transit} revealed />
            <Row label="Account" value={d?.accountNumber} revealed={revealed} />
          </dl>
        ) : (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Not captured yet. Refresh the connection to load these details from EasyWeb.
          </p>
        )}
      </section>

      <Separator />

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Limits</h3>
        {limits.length ? (
          <dl className="grid gap-1.5 text-sm">
            {limits.map((l) => (
              <div key={l.label} className="flex min-w-0 items-baseline justify-between gap-3">
                <dt className="min-w-0 truncate text-muted-foreground">{l.label}</dt>
                <dd className="shrink-0 tabular-nums">{l.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No limits found. Refresh the connection to load them.</p>
        )}
      </section>

      {data?.updatedAt && <p className="text-xs text-muted-foreground">Captured {formatRelative(data.updatedAt)}</p>}
    </div>
  )
}

function Row({ label, value, revealed }: { label: string; value: string | null | undefined; revealed: boolean }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const shown = revealed ? value : `•••${value.slice(-3)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(value!)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1">
        <span className="font-mono tabular-nums">{shown}</span>
        <Button variant="ghost" size="icon-xs" aria-label={`Copy ${label.toLowerCase()}`} onClick={copy}>
          {copied ? <Check /> : <Copy />}
        </Button>
      </dd>
    </div>
  )
}
