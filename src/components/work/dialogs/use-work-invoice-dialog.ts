import type { InvoiceDraft } from "@/components/work/dialogs/invoice-dialog"
import {
  fillWorkInvoiceFromDraft,
  workInvoiceHoursN,
  workInvoiceLastCounter,
} from "@/components/work/dialogs/work-invoice-compute"
import { workInvoiceValid } from "@/components/work/dialogs/work-invoice-valid"
import { money } from "@/components/work/dialogs/form"
import { mulMoney } from "../../../../shared/money.ts"
import { runDialogSave } from "@/components/work/dialogs/run-dialog-save"
import { runWorkInvoiceSave } from "@/components/work/dialogs/work-invoice-save"
import { formatMoney, isoDate } from "@/lib/format"
import { parseHours } from "@/lib/work"
import { useDialogDraftFill } from "@/components/work/dialogs/use-dialog-draft-fill"
import { useMemo, useState } from "react"

export function useWorkInvoiceDialog(
  draft: InvoiceDraft | null,
  onClose: () => void
) {
  const job = draft?.job
  const editing = draft?.invoice
  const [mode, setMode] = useState<"hours" | "tracker">("hours")
  const [hours, setHours] = useState("")
  const [counter, setCounter] = useState("")
  const [rate, setRate] = useState("")
  const [total, setTotal] = useState("")
  const [totalTouched, setTotalTouched] = useState(false)
  const [includeShifts, setIncludeShifts] = useState(true)
  const [date, setDate] = useState(isoDate)
  const [proof, setProof] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  const lastCounter = useMemo(
    () => (job ? workInvoiceLastCounter(job, editing) : null),
    [job, editing]
  )

  useDialogDraftFill(draft, (value) => {
    const filled = fillWorkInvoiceFromDraft(value)
    setMode(filled.mode)
    setHours(filled.hours)
    setCounter(filled.counter)
    setRate(filled.rate)
    setTotal(filled.total)
    setTotalTouched(filled.totalTouched)
    setIncludeShifts(true)
    setDate(filled.date || isoDate())
    setProof(filled.proof)
    setNote(filled.note)
  })

  const counterN = parseHours(counter)
  const hoursN = workInvoiceHoursN(mode, counterN, lastCounter, hours)
  const rateN = Number(rate)
  const autoTotal =
    hoursN !== null && Number.isFinite(rateN) ? mulMoney(rateN, hoursN) : null
  const totalN = totalTouched ? Number(total) : autoTotal
  const shifts = !editing && job ? job.unbilled : []
  const proofOk = !proof.trim() || /^https?:\/\/\S+$/i.test(proof.trim())
  const valid = workInvoiceValid({
    hoursN,
    rateN,
    totalN,
    date,
    proof,
    mode,
    counterN,
  })

  function save(e: React.FormEvent) {
    if (!job || !valid || hoursN === null || totalN === null) return
    void runDialogSave(
      setSaving,
      () =>
        runWorkInvoiceSave({
          job,
          editing,
          mode,
          hoursN,
          rateN,
          totalN,
          counterN,
          lastCounter,
          date,
          proof,
          note,
          includeShifts,
          shifts,
        }),
      onClose,
      e
    )
  }

  const submitLabel = editing
    ? "Save"
    : totalN
      ? `Bill ${formatMoney(totalN, job?.currency)}`
      : "Bill"

  return {
    job,
    mode,
    setMode,
    hours,
    setHours,
    counter,
    setCounter,
    rate,
    setRate: (v: string) => setRate(money(v)),
    total,
    setTotal: (v: string) => {
      setTotalTouched(true)
      setTotal(money(v))
    },
    totalTouched,
    setTotalTouched,
    includeShifts,
    setIncludeShifts,
    date,
    setDate,
    proof,
    setProof,
    note,
    setNote,
    saving,
    save,
    valid,
    lastCounter,
    counterN,
    hoursN,
    autoTotal,
    totalN,
    shifts,
    proofOk,
    submitLabel,
  }
}
