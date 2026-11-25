import { useLayoutEffect, useRef } from 'react'
import { formatMoney, getDisplayCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * A number that counts up to its value when it first appears, and glides to the new one when it
 * changes. Writes to the DOM directly so a frame doesn't cost a React render; screen readers get
 * the final value only. Honours "reduce motion".
 */
export function CountUp({
  value,
  format,
  duration = 900,
  className,
}: {
  value: number
  format: (n: number) => string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(0)
  const fmt = useRef(format)

  useLayoutEffect(() => {
    fmt.current = format
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const from = current.current
    const to = value
    if (from === to || reducedMotion()) {
      current.current = to
      el.textContent = fmt.current(to)
      return
    }
    el.textContent = fmt.current(from)
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - p) ** 3
      current.current = p === 1 ? to : from + (to - from) * eased
      el.textContent = fmt.current(current.current)
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      // Interrupted (value changed again, or unmounted): carry on from wherever it got to.
    }
  }, [value, duration])

  return (
    <span className={cn('tabular-nums', className)}>
      <span ref={ref} aria-hidden />
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}

/** formatMoney, counting up. */
export function AnimatedMoney({
  value,
  currency = getDisplayCurrency(),
  sign,
  className,
}: {
  value: number
  currency?: string
  sign?: boolean
  className?: string
}) {
  return <CountUp value={value} format={(n) => formatMoney(n, currency, { sign })} className={className} />
}
