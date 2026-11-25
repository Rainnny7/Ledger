import { PaymentMethodDialog } from "@/components/invoices/payment-method-dialog"
import { pdfFileName } from "@/components/invoices/pdf-files"
import { ShareDialog } from "@/components/invoices/share-dialog"
import { InvoiceEditorBillTo } from "@/components/invoices/editor/invoice-editor-bill-to"
import { InvoiceEditorDetails } from "@/components/invoices/editor/invoice-editor-details"
import { InvoiceEditorFrom } from "@/components/invoices/editor/invoice-editor-from"
import { InvoiceEditorHeader } from "@/components/invoices/editor/invoice-editor-header"
import { InvoiceEditorItems } from "@/components/invoices/editor/invoice-editor-items"
import { InvoiceEditorLook } from "@/components/invoices/editor/invoice-editor-look"
import { InvoiceEditorMethods } from "@/components/invoices/editor/invoice-editor-methods"
import { InvoiceEditorNotes } from "@/components/invoices/editor/invoice-editor-notes"
import { InvoicePreview } from "@/components/invoices/editor/preview"
import { useInvoiceEditor } from "@/components/invoices/editor/use-invoice-editor"
import type { Draft } from "@/components/invoices/editor/draft"
import type { Invoice, InvoicesData } from "@/lib/api"

export function InvoiceEditor({
  data,
  saved,
  initial,
}: {
  data: InvoicesData
  saved: Invoice | null
  initial: Draft
}) {
  const model = useInvoiceEditor({ data, saved, initial })

  return (
    <div className="grid gap-6">
      <InvoiceEditorHeader model={model} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 gap-4">
          <InvoiceEditorBillTo model={model} />
          <InvoiceEditorItems model={model} />
          <InvoiceEditorDetails model={model} />
          <InvoiceEditorMethods model={model} />
          <InvoiceEditorLook model={model} />
          <InvoiceEditorNotes model={model} />
          <InvoiceEditorFrom model={model} />
        </div>

        <InvoicePreview
          source={model.source}
          fileName={pdfFileName({
            number: model.d.number,
            client: model.d.client,
          })}
        />
      </div>

      {model.liveSaved && model.shareOpen && (
        <ShareDialog
          invoice={model.liveSaved}
          methods={data.methods}
          onClose={model.closeShare}
        />
      )}
      <PaymentMethodDialog
        open={!!model.methodDialog}
        method={model.methodDialog?.method ?? null}
        paypal={data.paypal}
        onClose={() => model.setMethodDialog(null)}
        onSaved={(m) =>
          !model.d.methodIds.includes(m.id) &&
          model.set("methodIds", [...model.d.methodIds, m.id])
        }
      />
    </div>
  )
}
