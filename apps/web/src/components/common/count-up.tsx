import { useLayoutEffect, useRef } from "react"
import { ForeignMoney } from "@/components/common/money"
import { negativeMoneyClass } from "@/components/common/negative-money-class"
import { formatMoney, getDisplayCurrency } from "@/lib/format"
import { cn } from "cn"

const reducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

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
	format: (amount: number) => string
	duration?: number
	className?: string
}) {
	const ref = useRef<HTMLSpanElement>(null)
	const current = useRef(0)
	const latestFormat = useRef(format)

	useLayoutEffect(() => {
		latestFormat.current = format
	})

	useLayoutEffect(() => {
		const element = ref.current
		if (!element) {
			return
		}
		const from = current.current
		const to = value
		if (from === to || reducedMotion()) {
			current.current = to
			element.textContent = latestFormat.current(to)
			return
		}
		element.textContent = latestFormat.current(from)
		const start = performance.now()
		let frame = 0
		const step = (now: number) => {
			const progress = Math.min(1, (now - start) / duration)
			const eased = 1 - (1 - progress) ** 3
			current.current = progress === 1 ? to : from + (to - from) * eased
			element.textContent = latestFormat.current(current.current)
			if (progress < 1) {
				frame = requestAnimationFrame(step)
			}
		}
		frame = requestAnimationFrame(step)
		return () => {
			cancelAnimationFrame(frame)
			// Interrupted (value changed again, or unmounted): carry on from wherever it got to.
		}
	}, [value, duration])

	return (
		<span className={cn("tabular-nums", className)}>
			<span ref={ref} aria-hidden />
			<span className="sr-only">{format(value)}</span>
		</span>
	)
}

/** formatMoney, counting up. In another currency, hovering it shows the amount in the person's own. */
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
	return (
		<ForeignMoney value={value} currency={currency} sign={sign}>
			<CountUp
				value={value}
				format={(amount) => formatMoney(amount, currency, { sign })}
				className={negativeMoneyClass(value, className)}
			/>
		</ForeignMoney>
	)
}
