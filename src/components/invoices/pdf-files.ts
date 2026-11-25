import type { Invoice, PaymentMethod } from "@/lib/api"
import { safeFileName, shareUrl } from "@/lib/invoice"
import type { InvoicePdfSource } from "@/lib/invoice-pdf-data"

/** The PDF renderer (WebAssembly + font) only downloads the first time a PDF is needed. */
export const renderPdf = (source: InvoicePdfSource) =>
  import("@/lib/invoice-pdf").then((m) => m.renderInvoicePdf(source))

/** Everything the PDF needs from a saved invoice. */
export function pdfSource(
  inv: Invoice,
  methods: PaymentMethod[]
): InvoicePdfSource {
  const byId = new Map(methods.map((m) => [m.id, m]))
  return {
    invoice: inv,
    methods: inv.methodIds
      .map((id) => byId.get(id))
      .filter((m): m is PaymentMethod => !!m),
    paid: inv.paid,
    url: shareUrl(inv.token),
  }
}

export const pdfFileName = (inv: Pick<Invoice, "number" | "client">) =>
  `${safeFileName(["Invoice", inv.number, inv.client.name].filter(Boolean).join(" "))}.pdf`

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
