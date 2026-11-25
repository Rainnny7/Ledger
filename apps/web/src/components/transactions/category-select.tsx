import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import type { Category } from "@/lib/api"
import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"

const categoryItems = CATEGORY_LIST.map((category) => ({
	value: category,
	label: CATEGORY_META[category].label,
}))

/** React/UI entry: `CategorySelect`. */
export function CategorySelect({
	value,
	onChange,
}: {
	value: Category
	onChange: (value: Category) => void
}) {
	return (
		<Select
			items={categoryItems}
			value={value}
			onValueChange={(next) => next && onChange(next as Category)}
		>
			<SelectTrigger className="w-full">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{CATEGORY_LIST.map((category) => {
					const Icon = CATEGORY_META[category].icon
					return (
						<SelectItem key={category} value={category}>
							<Icon /> {CATEGORY_META[category].label}
						</SelectItem>
					)
				})}
			</SelectContent>
		</Select>
	)
}
