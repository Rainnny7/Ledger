import { useState } from "react"
import { toast } from "sonner"
import { api, type WorkJob, type WorkJobInput } from "@/lib/api"
import { getDisplayCurrency } from "@/lib/format"
import { EVERY_PRESETS } from "@/lib/work"
import { fail } from "@/components/work/dialogs/form"
import { roundMoney } from "../../../../shared/money.ts"

export interface JobForm {
  name: string
  rate: string
  currency: string
  payAmount: string
  every: string
  customDays: string
  color: string
  notes: string
}

export const EVERY_ITEMS = [
  ...EVERY_PRESETS.map((p) => ({ value: String(p.days), label: p.label })),
  { value: "custom", label: "Every … days" },
  { value: "none", label: "Whenever (no schedule)" },
]

/** The form's starting values: the job being edited, or a blank new one. */
function jobDefaults(job?: WorkJob | null): JobForm {
  const days = job?.payEveryDays ?? 7
  const preset = EVERY_PRESETS.some((p) => p.days === days)
  return {
    name: job?.name ?? "",
    rate: job ? String(job.rate) : "",
    currency: job?.currency ?? getDisplayCurrency(),
    payAmount: job?.payAmount ? String(job.payAmount) : "",
    every: job && !job.payEveryDays ? "none" : preset ? String(days) : "custom",
    customDays: preset ? "10" : String(days),
    color: job?.color ?? "ocean",
    notes: job?.notes ?? "",
  }
}

/** How many days apart payments come, or null for no schedule. */
function payDays(f: JobForm) {
  if (f.every === "none") return null
  return f.every === "custom" ? Number(f.customDays) : Number(f.every)
}

/** Whether the form can be saved, and the body to send if so. */
function jobBody(f: JobForm): WorkJobInput | null {
  const rateN = Number(f.rate)
  const payN = Number(f.payAmount || 0)
  const days = payDays(f)
  const valid =
    f.name.trim().length > 0 &&
    Number.isFinite(rateN) &&
    rateN > 0 &&
    Number.isFinite(payN) &&
    payN >= 0 &&
    (days === null || (Number.isInteger(days) && days >= 1 && days <= 366))
  if (!valid) return null
  return {
    name: f.name.trim(),
    rate: roundMoney(rateN),
    currency: f.currency,
    payAmount: payN > 0 && days ? roundMoney(payN) : null,
    payEveryDays: payN > 0 ? days : null,
    color: f.color,
    notes: f.notes.trim() || null,
  }
}

/** Adds the job, or saves changes to it, and says so. */
async function saveJob(job: WorkJob | null | undefined, body: WorkJobInput) {
  if (job) await api.updateWorkJob(job.id, body)
  else await api.createWorkJob(body)
  toast.success(
    job ? "Job updated" : `Added ${body.name}`,
    job ? undefined : { description: "Log hours as you go, then bill them." }
  )
}

/** The add/edit job form's state, refilled each time the dialog opens. */
export function useJobForm(
  open: boolean,
  job: WorkJob | null | undefined,
  onClose: () => void
) {
  const [form, setForm] = useState<JobForm>(() => jobDefaults())
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<JobForm>) => setForm((f) => ({ ...f, ...patch }))

  // Fill the form each time it opens (not on every refetch of the job while it's open). Done
  // during render rather than in an effect, so the old values never flash.
  const formFor = open ? (job?.id ?? "new") : null
  const [filledFor, setFilledFor] = useState<string | null>(null)
  if (formFor !== filledFor) {
    setFilledFor(formFor)
    if (formFor !== null) setForm(jobDefaults(job))
  }

  const body = jobBody(form)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!body) return
    setSaving(true)
    try {
      await saveJob(job, body)
      onClose()
    } catch (err) {
      fail(err)
    } finally {
      setSaving(false)
    }
  }

  return { form, set, valid: body !== null, saving, save }
}
