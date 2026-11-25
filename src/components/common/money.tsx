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
  const c = useConverter()
  if (
    value === null ||
    value === undefined ||
    !currency ||
    currency === c.home
  ) {
    return className ? (
      <span className={className}>{children}</span>
    ) : (
      <>{children}</>
    )
  }
  const converted = c.to(value, currency)
  const rate = c.to(1, currency)
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
            No exchange rate for {currency} yet, so this can’t be shown in{" "}
            {c.home}.
          </span>
        ) : (
          <>
            <span className="flex items-baseline justify-between gap-4">
              <span className="opacity-70">{currencyName(currency)}</span>
              <span>
                {formatMoney(value, currency, { sign })} {currency}
              </span>
            </span>
            <span className="flex items-baseline justify-between gap-4">
              <span className="opacity-70">Rate</span>
              <span>
                1 {currency} = {rateFormat.format(rate)} {c.home}
              </span>
            </span>
            <span className="my-0.5 h-px bg-border" />
            <span className="flex items-baseline justify-between gap-4 font-semibold">
              <span>In {c.home}</span>
              <span>
                ≈ {formatMoney(converted, c.home, { sign })} {c.home}
              </span>
            </span>
            {c.fx?.date && (
              <span className="max-w-56 text-[11px] text-muted-foreground">
                {c.fx.source === "live" && c.fx.fetchedAt
                  ? `Mid-market rate as of ${formatTimestamp(c.fx.fetchedAt)}.`
                  : `European Central Bank reference rate for ${formatDate(c.fx.date)}.`}{" "}
                Your bank’s rate usually includes a markup of a few percent.
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
      className={className}
    >
      {formatMoney(value, cur, { sign })}
    </ForeignMoney>
  )
}
