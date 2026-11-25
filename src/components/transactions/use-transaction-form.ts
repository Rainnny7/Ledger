import { useMemo, useState } from "react"
import { toast } from "sonner"
import type { Category, TaxTag, Transaction } from "@/lib/api"
import { CATEGORY_META, TAX_TAG_META } from "@/lib/categories"
import { api } from "@/lib/api"

export function useTransactionForm(
  t: Transaction | null,
  transactions: Transaction[],
  onUpdated: (tx: Transaction, merchantWide: boolean) => void
) {
  const [category, setCategory] = useState<Category>("other")
  const [applyAll, setApplyAll] = useState(false)
  const [note, setNote] = useState("")
  const [taxTag, setTaxTag] = useState<TaxTag | "none">("none")
  const [taxAll, setTaxAll] = useState(false)
  const [saving, setSaving] = useState(false)

  const [filledFrom, setFilledFrom] = useState<typeof t>(null)
  if (t !== filledFrom) {
    setFilledFrom(t)
    if (t) {
      setCategory(t.category)
      setApplyAll(t.categorySource === "rule")
      setNote(t.note ?? "")
      setTaxTag(t.taxTag ?? "none")
      setTaxAll(t.taxTagSource === "rule")
    }
  }

  const history = useMemo(() => {
    if (!t) return null
    const same = transactions.filter((x) => x.merchantKey === t.merchantKey)
    const out = same.filter((x) => x.amount < 0)
    const spent = out.reduce((s, x) => s - x.amount, 0)
    return {
      list: same,
      count: same.length,
      spent,
      avg: out.length ? spent / out.length : 0,
      first: same.at(-1)?.date,
    }
  }, [t, transactions])

  const taxChanged =
    !!t &&
    (taxTag !== (t.taxTag ?? "none") || taxAll !== (t.taxTagSource === "rule"))
  const dirty =
    !!t &&
    (category !== t.category ||
      applyAll !== (t.categorySource === "rule") ||
      note !== (t.note ?? "") ||
      taxChanged)

  async function save() {
    if (!t) return
    setSaving(true)
    try {
      const body: Parameters<typeof api.updateTransaction>[1] = {}
      if (note !== (t.note ?? "")) body.note = note || null
      const catChanged =
        category !== t.category || applyAll !== (t.categorySource === "rule")
      if (catChanged) {
        body.category = category
        body.applyToMerchant = applyAll
      }
      if (taxChanged) {
        if (t.taxTagSource === "rule" && !taxAll)
          await api.updateTransaction(t.id, {
            taxTag: null,
            applyTaxToMerchant: true,
          })
        body.taxTag = taxTag === "none" ? null : taxTag
        body.applyTaxToMerchant = taxAll
      }
      const { transaction } = await api.updateTransaction(t.id, body)
      const merchantWide =
        (catChanged && applyAll) ||
        (taxChanged && (taxAll || t.taxTagSource === "rule"))
      onUpdated(transaction, merchantWide)
      toast.success(
        catChanged && applyAll
          ? `All ${t.merchant} transactions are now ${CATEGORY_META[category].label}`
          : taxChanged && taxAll && taxTag !== "none"
            ? `All ${t.merchant} transactions are tagged ${TAX_TAG_META[taxTag].label.toLowerCase()}`
            : "Saved"
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function resetCategory() {
    if (!t) return
    setSaving(true)
    try {
      const { transaction } = await api.updateTransaction(t.id, {
        category: null,
        applyToMerchant: t.categorySource === "rule",
      })
      onUpdated(transaction, t.categorySource === "rule")
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
