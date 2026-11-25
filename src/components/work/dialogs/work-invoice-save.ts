import { fail, round2 } from "@/components/work/dialogs/form"
import { api, type WorkInvoice, type WorkJob } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { formatDuration } from "@/lib/work"
import { toast } from "sonner"

export async function saveWorkInvoice(opts: {
  job: WorkJob
  editing: WorkInvoice | undefined
  mode: "hours" | "tracker"
  hoursN: number
  rateN: number
  totalN: number
  counterN: number | null
  lastCounter: number | null
  date: string
  proof: string
  note: string
  includeShifts: boolean
  shifts: { id: string }[]
}) {
  const counterHours =
    opts.mode === "tracker"
      ? round2(opts.counterN!)
      : opts.lastCounter !== null
        ? round2(opts.lastCounter + opts.hoursN)
        : null
  const body = {
    date: opts.date,
    hours: round2(opts.hoursN),
    rate: round2(opts.rateN),
    total: round2(opts.totalN),
    counterHours,
    proofUrl: opts.proof.trim() || null,
    note: opts.note.trim() || null,
  }
  if (opts.editing) {
    await api.updateWorkInvoice(opts.editing.id, body)
    toast.success("Bill updated")
    return
  }
  await api.createWorkInvoice(opts.job.id, {
    ...body,
    entryIds: opts.includeShifts ? opts.shifts.map((s) => s.id) : [],
  })
  toast.success(`Billed ${formatMoney(body.total, opts.job.currency)}`, {
    description: `${formatDuration(body.hours)} for ${opts.job.name}`,
  })
}

export async function runWorkInvoiceSave(
  ...args: Parameters<typeof saveWorkInvoice>
) {
  try {
    await saveWorkInvoice(...args)
    return true
  } catch (err) {
    fail(err)
    return false
  }
}
