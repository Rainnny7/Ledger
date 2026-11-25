import { useState } from "react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { currencyFlagUrl, currencyName, currencyOptions } from "@/lib/currency"
import { cn } from "cn"

/** A small flag for a currency; an empty chip of the same size when there's none or it fails to load. */
export function CurrencyFlag({
	code,
	className,
}: {
	code: string
	className?: string
}) {
	const url = currencyFlagUrl(code)
	const [failed, setFailed] = useState<string | null>(null)
	const box = cn(
		"inline-block h-3.5 w-5 shrink-0 self-center rounded-[3px] ring-1 ring-foreground/10",
		className
	)
	if (!url || failed === url) {
		return <span aria-hidden className={cn(box, "bg-muted")} />
	}
	return (
		<img
			src={url}
			alt=""
			aria-hidden
			loading="lazy"
			decoding="async"
			referrerPolicy="no-referrer"
			onError={() => setFailed(url)}
			className={cn(box, "object-cover")}
		/>
	)
}

/** A currency picker: flag + "USD · US Dollar" in the list, flag + code once picked. */
export function CurrencySelect({
	id,
	value,
	onChange,
	className,
	disabled,
}: {
	id?: string
	value: string
	onChange: (code: string) => void
	className?: string
	disabled?: boolean
}) {
	const options = currencyOptions(value)
	return (
		<Select
			items={options.map((code) => ({ value: code, label: code }))}
			value={value}
			onValueChange={(code) => code && onChange(code)}
			disabled={disabled}
		>
			<SelectTrigger id={id} className={cn("w-full", className)}>
				<SelectValue>
					{(code: string | null) =>
						code ? (
							<>
								<CurrencyFlag code={code} />
								{code}
							</>
						) : null
					}
				</SelectValue>
			</SelectTrigger>
			{/* Wider than a narrow trigger (it often sits in a half-width column) so names aren't cut off. */}
			<SelectContent className="w-auto max-w-[min(20rem,var(--available-width))] min-w-[max(var(--anchor-width),14rem)]">
				{options.map((code) => (
					<SelectItem key={code} value={code}>
						<CurrencyFlag code={code} />
						<span className="font-medium">{code}</span>
						<span className="truncate text-muted-foreground">
							{currencyName(code)}
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
