/** What every invoice template draws: already formatted, so templates only lay it out. */
export interface InvoicePdfParty {
  name: string
  lines: string[]
}

export interface InvoicePdfMethod {
  label: string
  lines: { label: string; value: string }[]
  /** Wallet address or pay link to scan. */
  qr: string | null
  /** A link the payer can follow, printed under the details. */
  link: string | null
}

export interface InvoicePdfData {
  number: string
  issueDate: string
  /** "On receipt" when there's no due date. */
  dueDate: string
  /** Drawn as a stamp next to the totals. */
  stamp: 'PAID' | 'VOID' | null
  from: InvoicePdfParty
  client: InvoicePdfParty
  items: { description: string; quantity: string; unitPrice: string; amount: string }[]
  totals: { label: string; value: string; strong?: boolean }[]
  amountDue: string
  methods: InvoicePdfMethod[]
  /** The share page, where the invoice can be paid online. */
  payUrl: string | null
  notes: string | null
  terms: string | null
}
