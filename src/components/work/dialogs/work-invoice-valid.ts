import { validDate } from "@/components/work/dialogs/form"

export function workInvoiceValid(opts: {
  hoursN: number | null
  rateN: number
  totalN: number | null
  date: string
  proof: string
  mode: "hours" | "tracker"
  counterN: number | null
}) {
  const proofOk = !opts.proof.trim() || /^https?:\/\/\S+$/i.test(opts.proof.trim())
  return (
    opts.hoursN !== null &&
    opts.hoursN > 0 &&
    Number.isFinite(opts.rateN) &&
    opts.rateN > 0 &&
    opts.totalN !== null &&
    Number.isFinite(opts.totalN) &&
    opts.totalN >= 0 &&
    validDate(opts.date) &&
    proofOk &&
    (opts.mode === "hours" || opts.counterN !== null)
  )
}