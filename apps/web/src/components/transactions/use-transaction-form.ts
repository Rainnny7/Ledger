import { useMemo, useState } from "react"
import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import type { Category, TaxTag, Transaction } from "@/lib/api"
import { CATEGORY_META, TAX_TAG_META } from "@/lib/categories"
import { api } from "@/lib/api"

/** React/UI entry: `useTransactionForm`. */
export function useTransactionForm(
	selected: Transaction | null,
	transactions: Transaction[],
	onUpdated: (transaction: Transaction, merchantWide: boolean) => void
) {
	const [category, setCategory] = useState<Category>("other")
	const [applyAll, setApplyAll] = useState(false)
	const [note, setNote] = useState("")
	const [taxTag, setTaxTag] = useState<TaxTag | "none">("none")
	const [taxAll, setTaxAll] = useState(false)
	const [saving, setSaving] = useState(false)

	const [filledFrom, setFilledFrom] = useState<typeof selected>(null)
	if (selected !== filledFrom) {
		setFilledFrom(selected)
		if (selected) {
			setCategory(selected.category)
			setApplyAll(selected.categorySource === "rule")
			setNote(selected.note ?? "")
			setTaxTag(selected.taxTag ?? "none")
			setTaxAll(selected.taxTagSource === "rule")
		}
	}

	const history = useMemo(() => {
		if (!selected) {
			return null
		}
		const same = transactions.filter(
			(row) => row.merchantKey === selected.merchantKey
		)
		const out = same.filter((row) => row.amount < 0)
		const spent = out.reduce((sum, row) => sum - row.amount, 0)
		return {
			list: same,
			count: same.length,
			spent,
			avg: out.length ? spent / out.length : 0,
			first: same.at(-1)?.date,
		}
	}, [selected, transactions])

	const taxChanged =
		!!selected &&
		(taxTag !== (selected.taxTag ?? "none") ||
			taxAll !== (selected.taxTagSource === "rule"))
	const dirty =
		!!selected &&
		(category !== selected.category ||
			applyAll !== (selected.categorySource === "rule") ||
			note !== (selected.note ?? "") ||
			taxChanged)

	async function save() {
		if (!selected) {
			return
		}
		setSaving(true)
		try {
			const body: Parameters<typeof api.updateTransaction>[1] = {}
			if (note !== (selected.note ?? "")) {
				body.note = note || null
			}
			const catChanged =
				category !== selected.category ||
				applyAll !== (selected.categorySource === "rule")
			if (catChanged) {
				body.category = category
				body.applyToMerchant = applyAll
			}
			if (taxChanged) {
				if (selected.taxTagSource === "rule" && !taxAll) {
					await api.updateTransaction(selected.id, {
						taxTag: null,
						applyTaxToMerchant: true,
					})
				}
				body.taxTag = taxTag === "none" ? null : taxTag
				body.applyTaxToMerchant = taxAll
			}
			const { transaction: updated } = await api.updateTransaction(
				selected.id,
				body
			)
			const merchantWide =
				(catChanged && applyAll) ||
				(taxChanged && (taxAll || selected.taxTagSource === "rule"))
			onUpdated(updated, merchantWide)
			toast.success(
				catChanged && applyAll
					? `All ${selected.merchant} transactions are now ${CATEGORY_META[category].label}`
					: taxChanged && taxAll && taxTag !== "none"
						? `All ${selected.merchant} transactions are tagged ${TAX_TAG_META[taxTag].label.toLowerCase()}`
						: "Saved"
			)
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(false)
		}
	}

	async function resetCategory() {
		if (!selected) {
			return
		}
		setSaving(true)
		try {
			const { transaction: updated } = await api.updateTransaction(
				selected.id,
				{
					category: null,
					applyToMerchant: selected.categorySource === "rule",
				}
			)
			onUpdated(updated, selected.categorySource === "rule")
		} finally {
			setSaving(false)
		}
	}

	return {
		category,
		setCategory,
		applyAll,
		setApplyAll,
		note,
		setNote,
		taxTag,
		setTaxTag,
		taxAll,
		setTaxAll,
		saving,
		dirty,
		taxChanged,
		history,
		save,
		resetCategory,
	}
}
