import type { ComponentType } from 'react'
import { PaypalMark } from '@/components/logos/paypal-mark'
import { cn } from '@/lib/utils'

export type ProviderId = 'td' | 'paypal'

/** Everything the UI needs to know about each provider Ledger can connect to. */
export const PROVIDERS: Record<
  ProviderId,
  {
    label: string
    blurb: string
    history: string
    color: string
    mark: string
    /** The provider's own logo, shown on a light tile instead of the monogram. */
    logo?: ComponentType<{ className?: string }>
    keepsSecret: boolean
  }
> = {
  td: {
    label: 'TD EasyWeb',
    blurb: 'Chequing, savings, credit cards and loans',
    history: 'up to 18 months',
    color: '#008a00',
    mark: 'TD',
    keepsSecret: false,
  },
  paypal: {
    label: 'PayPal',
    blurb: 'Your PayPal balance and payments, via a REST API app',
    history: 'up to 3 years',
    color: '#003087',
    mark: 'P',
    logo: PaypalMark,
    keepsSecret: true,
  },
}

export const isProviderId = (v: string): v is ProviderId => v in PROVIDERS

/** A provider's logo (or monogram), used to label its connections. */
export function InstitutionBadge({ institution, className }: { institution: string; className?: string }) {
  const p = isProviderId(institution) ? PROVIDERS[institution] : null
  if (p?.logo) {
    const Logo = p.logo
    return (
      <span
        aria-hidden
        className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-md border bg-white p-1.5 shadow-xs', className)}
      >
        <Logo className="size-full" />
      </span>
    )
  }
  return (
    <span
      aria-hidden
      style={{ backgroundColor: p?.color }}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted-foreground text-sm font-bold tracking-tight text-white',
        className,
      )}
    >
      {p?.mark ?? institution.slice(0, 2).toUpperCase()}
    </span>
  )
}
