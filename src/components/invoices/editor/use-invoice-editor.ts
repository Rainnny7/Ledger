import { fail } from "@/components/invoices/notify"
import {
  recentClients,
  toItems,
  type Draft,
  type ItemDraft,
} from "@/components/invoices/editor/draft"
import { invoiceState } from "@/components/invoices/invoice-state"
import {
  api,
  type Invoice,
  type InvoiceInput,
  type InvoiceParty,
  type InvoicesData,
  type PaymentMethod,
} from "@/lib/api"
import { DEMO_READ_ONLY, demoMode } from "@/lib/demo"
import { addDays } from "@/lib/format"
import { invoiceMoney, shareUrl } from "@/lib/invoice"
import { invoiceTotals } from "../../../../shared/invoice.ts"
import type { InvoicePdfSource } from "@/lib/invoice-pdf-data"
import { confirmDialog } from "@/lib/confirm"
import { URL_OPTIONS } from "@/lib/url-state"
import { useQueryState } from "nuqs"
import { useEffect, useMemo, useRef, useState } from "react"
import { useBlocker, useNavigate } from "react-router"
import { toast } from "sonner"

export function useInvoiceEditor({
  data,
  saved,
  initial,
}: {
  data: InvoicesData
  saved: Invoice | null
  initial: Draft
}) {
  const navigate = useNavigate()
  const [d, setD] = useState<Draft>(initial)
  const [saving, setSaving] = useState<"save" | "send" | null>(null)
  const [sharing, setSharing] = useState(false)
  const [methodDialog, setMethodDialog] = useState<{
    method: PaymentMethod | null
  } | null>(null)
  const [showFrom, setShowFrom] = useState(!initial.from.name)
  const [showMore, setShowMore] = useState(
    !!(initial.client.phone || initial.client.taxId)
  )
  const [dirty, setDirtyState] = useState(false)
  const dirtyRef = useRef(false)
  const setDirty = (v: boolean) => {
    dirtyRef.current = v
    setDirtyState(v)
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((x) => ({ ...x, [k]: v }))
    setDirty(true)
  }
  const setParty = (k: "from" | "client", patch: Partial<InvoiceParty>) => {
    setD((x) => ({ ...x, [k]: { ...x[k], ...patch } }))
    setDirty(true)
  }
  const setItem = (key: number, patch: Partial<ItemDraft>) => {
    setD((x) => ({
      ...x,
      items: x.items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    }))
    setDirty(true)
  }

  const items = toItems(d.items)
  const totals = invoiceTotals({
    items,
    taxRate: d.taxRate,
    discount: d.discount,
  })
  const paid = saved?.paid ?? 0
  const money = (n: number) => invoiceMoney(n, d.currency)
  const methodById = useMemo(
    () => new Map(data.methods.map((m) => [m.id, m])),
    [data.methods]
  )
  const selectedMethodIds = useMemo(() => new Set(d.methodIds), [d.methodIds])
  const chosen = d.methodIds
    .map((mid) => methodById.get(mid))
    .filter((m): m is PaymentMethod => !!m)
  const clients = recentClients(data.invoices)

  const valid =
    d.number.trim() &&
    items.length > 0 &&
    items.every((i) => i.description) &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.issueDate)

  const source: InvoicePdfSource = {
    invoice: { ...d, items },
    methods: chosen,
    paid,
    url: saved ? shareUrl(saved.token) : null,
  }

  async function save(then: "stay" | "send") {
    if (demoMode) return toast.error(DEMO_READ_ONLY)
    if (!valid)
      return toast.error(
        items.length
          ? "Every line item needs a description."
          : "Add at least one line item."
      )
    setSaving(then === "send" ? "send" : "save")
    const body: InvoiceInput = {
      ...d,
      number: d.number.trim(),
      items,
      notes: d.notes?.trim() || null,
      terms: d.terms?.trim() || null,
      taxLabel: d.taxLabel.trim() || "Tax",
    }
    try {
      const { invoice } = saved
        ? await api.updateInvoice(saved.id, body)
        : await api.createInvoice(body)
      setDirty(false)
      if (!saved)
        navigate(`/invoices/${invoice.id}${then === "send" ? "?send=1" : ""}`, {
          replace: true,
        })
      else if (then === "send") setSharing(true)
      if (then === "stay")
        toast.success(
          saved ? "Invoice saved" : `Invoice ${invoice.number} saved`
        )
    } catch (err) {
      fail(err)
    } finally {
      setSaving(null)
    }
  }

  const [send, setSend] = useQueryState("send", URL_OPTIONS)
  const shareOpen = sharing || (!!saved && !!send)
  function closeShare() {
    setSharing(false)
    if (send) void setSend(null)
  }

  useEffect(() => {
    if (!dirty || demoMode) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !demoMode &&
      dirtyRef.current &&
      currentLocation.pathname !== nextLocation.pathname
  )
  useEffect(() => {
    if (blocker.state !== "blocked") return
    void confirmDialog({
      title: "Leave without saving?",
      description: "Your changes to this invoice haven’t been saved.",
      action: "Leave",
      destructive: true,
    }).then((leave) => (leave ? blocker.proceed() : blocker.reset()))
  }, [blocker])

  const state = saved ? invoiceState(saved) : null
  const liveSaved = saved
    ? (data.invoices.find((i) => i.id === saved.id) ?? saved)
    : null
  const dueDays = d.dueDate
    ? Math.round((Date.parse(d.dueDate) - Date.parse(d.issueDate)) / 86_400_000)
    : 0

  const onIssueDate = (v: string) => {
    setD((x) => ({
      ...x,
      issueDate: v,
      dueDate:
        x.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(v)
          ? addDays(v, dueDays)
          : x.dueDate,
    }))
    setDirty(true)
  }

  return {
    d,
    set,
    setParty,
    setItem,
    onIssueDate,
    items,
    totals,
    paid,
    money,
    methodById,
    selectedMethodIds,
    chosen,
    clients,
    valid,
    source,
    save,
    saving,
    dirty,
    showFrom,
    setShowFrom,
    showMore,
    setShowMore,
    methodDialog,
    setMethodDialog,
    shareOpen,
    closeShare,
    liveSaved,
    state,
    saved,
    dueDays,
    data,
    initial,
  }
}

export type InvoiceEditorModel = ReturnType<typeof useInvoiceEditor>
