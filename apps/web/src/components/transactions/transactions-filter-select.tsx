import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

/** React/UI entry: `TransactionsFilterSelect`. */
export function TransactionsFilterSelect({
	items,
	value,
	onChange,
	className,
	label,
}: {
	items: { value: string; label: string }[]
	value: string
	onChange: (value: string) => void
	className?: string
	/** What the select filters by, for screen readers: the trigger only shows the chosen value. */
	label: string
}) {
	return (
		<Select
			items={items}
			value={value}
			onValueChange={(next) => next && onChange(next as string)}
		>
			<SelectTrigger className={className} aria-label={label}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{items.map((i) => (
					<SelectItem key={i.value} value={i.value}>
						{i.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	)
}
