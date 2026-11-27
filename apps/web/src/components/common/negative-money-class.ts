import { cn } from "cn"

/**
 * Negative figures are red everywhere, mirroring the green used for positive ones; an explicit
 * colour in `className` wins.
 */
export function negativeMoneyClass(
	value: number | null | undefined,
	className?: string
) {
	return value !== null && value !== undefined && value < 0
		? cn("text-red-600 dark:text-red-400", className)
		: className
}
