import { CategorySelect } from "@/components/transactions/category-select"
import { Label } from "@/components/ui/label"
import type { Category } from "@/lib/api"

/** Category picker row used inside the subscription dialog. */
export function SubscriptionCategoryField({
	category,
	onCategory,
}: {
	category: Category
	onCategory: (category: Category) => void
}) {
	return (
		<div className="grid min-w-0 gap-2">
			<Label>Category</Label>
			<CategorySelect value={category} onChange={onCategory} />
		</div>
	)
}
