import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

/** Labelled select over plain string items, without a placeholder. */
export function PlainSelect({
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
	label: string
}) {
	return (
		<Select
			items={items}
			value={value}
			onValueChange={(selectedValue) =>
				selectedValue && onChange(selectedValue as string)
			}
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
