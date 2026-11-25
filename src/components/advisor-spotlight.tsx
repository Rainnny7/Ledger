import { ArrowRight, Lightbulb } from 'lucide-react'
import { Link } from 'react-router'
import { perYear, TipCard, useAdvice } from '@/components/advisor-bits'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** The dashboard's Advisor strip: the few tips most worth acting on. Renders nothing when there are none. */
export function AdvisorSpotlight() {
  const { tips, dismiss } = useAdvice()
  // Wins are nice to see on the Advisor page, but the dashboard keeps to things worth doing.
  const actionable = tips.filter((t) => t.kind !== 'win')
  if (actionable.length === 0) return null

  const shown = actionable.slice(0, 3)
  const potential = actionable.reduce((n, t) => n + (t.yearly ?? 0), 0)

  return (
    <section aria-label="Advisor tips" className="rounded-xl border bg-card p-4 animate-[ledger-rise_420ms_ease-out_both] sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/12 text-primary">
              <Lightbulb className="size-3.5" />
            </span>
            Advisor
          </h2>
          {potential >= 20 && (
            <span className="text-sm text-muted-foreground tabular-nums">Up to ~{perYear(potential)} you could keep</span>
          )}
        </div>
        <Link to="/advisor" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-mr-2 text-muted-foreground')}>
          {actionable.length > shown.length ? `All ${tips.length} tips` : 'Open Advisor'} <ArrowRight />
        </Link>
      </div>
      <div className={cn('grid gap-3', shown.length > 1 && 'md:grid-cols-2', shown.length > 2 && 'lg:grid-cols-3')}>
        {shown.map((t) => (
          <TipCard key={t.id} tip={t} onDismiss={dismiss} compact />
        ))}
      </div>
    </section>
  )
}
