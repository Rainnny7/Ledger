import { Label } from "@/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"

/** A labelled dropdown that fills its column, for the Work forms. */
export function FieldSelect({
	label,
	items,
	value,
	onChange,
}: {
	label: string
	items: { value: string; label: string }[]
	value: string
	onChange: (value: string) => void
}) {
	return (
		<div className="grid min-w-0 gap-2">
			<Label>{label}</Label>
			<Select
				items={items}
				value={value}
				onValueChange={(nextValue) => nextValue && onChange(nextValue)}
			>
				<SelectTrigger className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}
