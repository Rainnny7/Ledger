import { confirmDialog } from "@/lib/confirm"
import { api, type Category, type TaxTag } from "@/lib/api"
import { CATEGORY_META, TAX_TAG_META } from "@/lib/categories"
import { demoMode } from "@/lib/demo"
import { toast } from "sonner"

/** React/UI entry: `bulkRecategorize`. */
export async function bulkRecategorize(ids: string[], value: string) {
	if (demoMode) {
		return toast.error(
			"Demo mode is read-only. Exit demo mode to make changes."
		)
	}
	const label =
		value === "auto" ? "automatic" : CATEGORY_META[value as Category].label
	if (
		ids.length > 25 &&
		!(await confirmDialog({
			title: `Recategorize ${ids.length} transactions?`,
			description: `They’ll all be filed under ${label}.`,
			action: "Recategorize",
		}))
	) {
		return false
	}
	const { updated } = await api.updateTransactions(ids, {
		category: value === "auto" ? null : (value as Category),
	})
	toast.success(
		`${updated} transaction${updated === 1 ? "" : "s"} filed under ${label}`
	)
	return true
}

/** React/UI entry: `bulkRetag`. */
export async function bulkRetag(ids: string[], value: string) {
	if (demoMode) {
		return toast.error(
			"Demo mode is read-only. Exit demo mode to make changes."
		)
	}
	const taxTag = value === "none" ? null : (value as TaxTag)
	const { updated } = await api.updateTransactions(ids, { taxTag })
	toast.success(
		taxTag
			? `${updated} transaction${updated === 1 ? "" : "s"} tagged ${TAX_TAG_META[taxTag].label.toLowerCase()}`
			: `Tag removed from ${updated} transaction${updated === 1 ? "" : "s"}`
	)
	return true
}
