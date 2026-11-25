import { PaymentDialogAfter } from "@/components/work/dialogs/payment-dialog-after"
import { PaymentDialogAmount } from "@/components/work/dialogs/payment-dialog-amount"
import { PaymentDialogFx } from "@/components/work/dialogs/payment-dialog-fx"
import type { useWorkPaymentDialog } from "@/components/work/dialogs/use-work-payment-dialog"
import { WorkDialogFooter } from "@/components/work/dialogs/work-dialog-footer"

type Model = ReturnType<typeof useWorkPaymentDialog>

export function PaymentDialogForm({
  model,
  onClose,
}: {
  model: Model
  onClose: () => void
}) {
  const { save, valid, saving } = model

  return (
    <form className="grid gap-4" onSubmit={(e) => void save(e)}>
      <PaymentDialogAmount model={model} />
      <PaymentDialogFx model={model} />
      <PaymentDialogAfter model={model} />
      <WorkDialogFooter
        onClose={onClose}
        submitLabel="Record payment"
        disabled={!valid}
        saving={saving}
      />
    </form>
  )
}
