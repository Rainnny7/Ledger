import type { ReactNode } from "react"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { currencyName, useConverter } from "@/lib/currency"
import {
	formatDate,
	formatMoney,
	formatTimestamp,
	getDisplayCurrency,
} from "@/lib/format"
import { cn } from "cn"

const rateFormat = new Intl.NumberFormat("en-CA", {
	maximumSignificantDigits: 5,
})

/** Negative figures are red everywhere, mirroring the green used for positive ones; an explicit colour in `className` wins. */
export function negativeMoneyClass(
	value: number | null | undefined,
	className?: string
) {
	return value !== null && value !== undefined && value < 0
		? cn("text-red-600 dark:text-red-400", className)
		: className
}

/**
 * Wraps a figure in a foreign currency so hovering it shows what it comes to in the person's own
 * currency, with the rate used. Figures already in their currency are left as they are.
 */
export function ForeignMoney({
	value,
	currency,
	sign,
	className,
	children,
}: {
	value: number | null | undefined
	currency: string | null | undefined
	sign?: boolean
	className?: string
	children: ReactNode
}) {
	const converter = useConverter()
	if (
		value === null ||
		value === undefined ||
		!currency ||
		currency === converter.home
	) {
		return className ? (
			<span className={className}>{children}</span>
		) : (
			<>{children}</>
		)
	}
	const converted = converter.to(value, currency)
	const rate = converter.to(1, currency)
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span
						className={cn(
							"cursor-help underline decoration-muted-foreground/40 decoration-dotted underline-offset-4",
							className
						)}
					/>
				}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent
				className="grid min-w-48 gap-1.5 py-2 tabular-nums"
				side="top"
			>
				{converted === null || rate === null ? (
					<span>
						No exchange rate for {currency} yet, so this can’t be
						shown in {converter.home}.
					</span>
				) : (
					<>
						<span className="flex items-baseline justify-between gap-4">
							<span className="opacity-70">
								{currencyName(currency)}
							</span>
							<span>
								{formatMoney(value, currency, { sign })}{" "}
								{currency}
							</span>
						</span>
						<span className="flex items-baseline justify-between gap-4">
							<span className="opacity-70">Rate</span>
							<span>
								1 {currency} = {rateFormat.format(rate)}{" "}
								{converter.home}
							</span>
						</span>
						<span className="my-0.5 h-px bg-border" />
						<span className="flex items-baseline justify-between gap-4 font-semibold">
							<span>In {converter.home}</span>
							<span>
								≈{" "}
								{formatMoney(converted, converter.home, {
									sign,
								})}{" "}
								{converter.home}
							</span>
						</span>
						{converter.fx?.date && (
							<span className="max-w-56 text-[11px] text-muted-foreground">
								{converter.fx.source === "live" &&
								converter.fx.fetchedAt
									? `Mid-market rate as of ${formatTimestamp(converter.fx.fetchedAt)}.`
									: `European Central Bank reference rate for ${formatDate(converter.fx.date)}.`}{" "}
								Your bank’s rate usually includes a markup of a
								few percent.
							</span>
						)}
					</>
				)}
			</TooltipContent>
		</Tooltip>
	)
}

/** A money figure; in another currency, hovering it shows the amount in the person's own currency. */
export function Money({
	value,
	currency,
	sign,
	className,
}: {
	value: number | null | undefined
	currency?: string | null
	sign?: boolean
	className?: string
}) {
	const cur = currency || getDisplayCurrency()
	return (
		<ForeignMoney
			value={value}
			currency={cur}
			sign={sign}
			className={negativeMoneyClass(value, className)}
		>
			{formatMoney(value, cur, { sign })}
		</ForeignMoney>
	)
}
