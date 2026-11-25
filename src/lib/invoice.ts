/** Invoice helpers shared by the editor, the PDF and the public share page. */
import type {
  InvoiceParty,
  PaymentMethodKind,
  PublicPaymentMethod,
} from "./api"
import { formatMoney } from "./format"

export const TEMPLATES = [
  { id: "modern", label: "Modern" },
  { id: "minimal", label: "Minimal" },
  { id: "classic", label: "Classic" },
] as const
export type InvoiceTemplate = (typeof TEMPLATES)[number]["id"]

export const THEMES = [
  { id: "professional", label: "Professional", swatch: "#18181b" },
  { id: "modern", label: "Slate", swatch: "#334155" },
  { id: "elegant", label: "Elegant", swatch: "#78350f" },
  { id: "corporate", label: "Corporate", swatch: "#0f4c81" },
  { id: "forest", label: "Forest", swatch: "#15803d" },
  { id: "vivid", label: "Vivid", swatch: "#6d28d9" },
] as const
export type InvoiceTheme = (typeof THEMES)[number]["id"]

export interface MethodField {
  key: string
  label: string
  placeholder?: string
  required?: boolean
  multiline?: boolean
  /** Shown to the payer with a copy button. */
  copy?: boolean
}

export interface MethodKind {
  kind: PaymentMethodKind
  label: string
  /** One line under the name in the picker. */
  hint: string
  fields: MethodField[]
}

export const METHOD_KINDS: MethodKind[] = [
  {
    kind: "etransfer",
    label: "Interac e-Transfer",
    hint: "Canadian bank transfer to your email",
    fields: [
      {
        key: "email",
        label: "Send to (email or phone)",
        placeholder: "you@example.com",
        required: true,
        copy: true,
      },
      { key: "name", label: "Name on the account", placeholder: "Optional" },
      {
        key: "note",
        label: "Note for the payer",
        placeholder: "e.g. Autodeposit is on, no question needed",
      },
    ],
  },
  {
    kind: "paypal",
    label: "PayPal",
    hint: "PayPal.Me link or PayPal email",
    fields: [
      {
        key: "handle",
        label: "PayPal.Me username",
        placeholder: "yourname",
        copy: true,
      },
      {
        key: "email",
        label: "Or PayPal email",
        placeholder: "you@example.com",
        copy: true,
      },
    ],
  },
  {
    kind: "paypal-checkout",
    label: "PayPal checkout",
    hint: 'A "Pay with PayPal or card" button, marked paid automatically',
    fields: [],
  },
  {
    kind: "crypto",
    label: "Crypto",
    hint: "Bitcoin, Ethereum, USDC… with a QR code",
    fields: [
      {
        key: "coin",
        label: "Coin",
        placeholder: "BTC, ETH, USDC…",
        required: true,
      },
      {
        key: "network",
        label: "Network",
        placeholder: "e.g. Bitcoin, Ethereum, Solana, Base",
      },
      {
        key: "address",
        label: "Wallet address",
        placeholder: "bc1q…",
        required: true,
        copy: true,
      },
    ],
  },
  {
    kind: "bank",
    label: "Bank transfer",
    hint: "Wire / direct deposit details",
    fields: [
      { key: "accountName", label: "Account holder", copy: true },
      { key: "bankName", label: "Bank" },
      { key: "institution", label: "Institution no.", copy: true },
      { key: "transit", label: "Transit no.", copy: true },
      { key: "account", label: "Account no.", copy: true },
      { key: "routing", label: "Routing (ABA)", copy: true },
      { key: "iban", label: "IBAN", copy: true },
      { key: "swift", label: "SWIFT / BIC", copy: true },
    ],
  },
  {
    kind: "wise",
    label: "Wise",
    hint: "Wise email or payment link",
    fields: [
      { key: "email", label: "Wise email", copy: true },
      {
        key: "url",
        label: "Or Wise payment link",
        placeholder: "https://wise.com/pay/me/…",
      },
    ],
  },
  {
    kind: "venmo",
    label: "Venmo",
    hint: "Venmo username",
    fields: [
      {
        key: "handle",
        label: "Venmo username",
        placeholder: "your-name",
        required: true,
        copy: true,
      },
    ],
  },
  {
    kind: "cashapp",
    label: "Cash App",
    hint: "$cashtag",
    fields: [
      {
        key: "handle",
        label: "$Cashtag",
        placeholder: "$yourname",
        required: true,
        copy: true,
      },
    ],
  },
  {
    kind: "zelle",
    label: "Zelle",
    hint: "Zelle email or phone",
    fields: [
      { key: "contact", label: "Email or phone", required: true, copy: true },
      { key: "name", label: "Name it shows" },
    ],
  },
  {
    kind: "revolut",
    label: "Revolut",
    hint: "revolut.me username",
    fields: [
      {
        key: "handle",
        label: "Revolut username",
        placeholder: "yourname",
        required: true,
        copy: true,
      },
    ],
  },
  {
    kind: "link",
    label: "Payment link",
    hint: "Stripe, Square or any other pay link",
    fields: [
      {
        key: "url",
        label: "Link",
        placeholder: "https://buy.stripe.com/…",
        required: true,
      },
      { key: "note", label: "Note", placeholder: "e.g. Card or Apple Pay" },
    ],
  },
  {
    kind: "cheque",
    label: "Cheque",
    hint: "Who to make it out to and where to send it",
    fields: [
      { key: "payableTo", label: "Payable to", required: true },
      { key: "mailTo", label: "Mail to", multiline: true },
    ],
  },
  {
    kind: "cash",
    label: "Cash",
    hint: "In person",
    fields: [{ key: "note", label: "Instructions", placeholder: "Optional" }],
  },
  {
    kind: "other",
    label: "Other",
    hint: "Anything else, in your words",
    fields: [
      { key: "details", label: "Details", required: true, multiline: true },
    ],
  },
]

export const methodKind = (kind: PaymentMethodKind) =>
  METHOD_KINDS.find((k) => k.kind === kind) ?? METHOD_KINDS.at(-1)!

/** Whether the fields are enough to pay with. */
export function methodComplete(
  kind: PaymentMethodKind,
  fields: Record<string, string>
) {
  const def = methodKind(kind)
  if (kind === "paypal")
    return !!(fields.handle?.trim() || fields.email?.trim())
  if (kind === "wise") return !!(fields.email?.trim() || fields.url?.trim())
  if (kind === "bank") return !!(fields.account?.trim() || fields.iban?.trim())
  if (kind === "paypal-checkout") return !!fields.connectionId
  return def.fields
    .filter((f) => f.required)
    .every((f) => fields[f.key]?.trim())
}

const clean = (s: string | undefined) => (s ?? "").trim()
const handleOf = (s: string | undefined) =>
  clean(s)
    .replace(/^[@$]/, "")
    .replace(/^https?:\/\/\S+\//, "")

/** A link that opens the payment with the amount filled in, where the service supports one. */
export function payLink(
  m: Pick<PublicPaymentMethod, "kind" | "fields">,
  amount: number,
  currency: string
): string | null {
  const f = m.fields
  const amt = amount > 0 ? amount.toFixed(2) : ""
  switch (m.kind) {
    case "paypal": {
      const h = handleOf(f.handle)
      return h
        ? `https://paypal.me/${encodeURIComponent(h)}${amt ? `/${amt}${currency}` : ""}`
        : null
    }
    case "venmo": {
      const h = handleOf(f.handle)
      return h
        ? `https://venmo.com/${encodeURIComponent(h)}?txn=pay${amt ? `&amount=${amt}` : ""}`
        : null
    }
    case "cashapp": {
      const h = handleOf(f.handle)
      return h
        ? `https://cash.app/$${encodeURIComponent(h)}${amt ? `/${amt}` : ""}`
        : null
    }
    case "revolut": {
      const h = handleOf(f.handle)
      return h
        ? `https://revolut.me/${encodeURIComponent(h)}${amt ? `?amount=${Math.round(amount * 100)}&currency=${currency}` : ""}`
        : null
    }
    case "wise":
    case "link":
      return /^https:\/\//i.test(clean(f.url)) ? clean(f.url) : null
    default:
      return null
  }
}

/** The value the payer can scan: a pay link, or a wallet address. */
export function qrValue(
  m: Pick<PublicPaymentMethod, "kind" | "fields">,
  amount: number,
  currency: string
) {
  if (m.kind === "crypto") return clean(m.fields.address) || null
  return payLink(m, amount, currency)
}

/** The method as label/value lines, the way the PDF and the share page list it. */
export function methodLines(
  m: Pick<PublicPaymentMethod, "kind" | "fields">
): { label: string; value: string; copy: boolean }[] {
  const def = methodKind(m.kind)
  const lines = def.fields
    .filter((f) => clean(m.fields[f.key]))
    .map((f) => ({
      label: shortLabel(f),
      value: clean(m.fields[f.key]),
      copy: !!f.copy,
    }))
  if (m.kind === "cashapp")
    return lines.map((l) => ({ ...l, value: `$${handleOf(l.value)}` }))
  if (m.kind === "paypal")
    return lines.map((l) =>
      l.label === "PayPal.Me"
        ? { ...l, value: `paypal.me/${handleOf(l.value)}` }
        : l
    )
  return lines
}

function shortLabel(f: MethodField) {
  const map: Record<string, string> = {
    "Send to (email or phone)": "Send to",
    "Name on the account": "Name",
    "Note for the payer": "Note",
    "PayPal.Me username": "PayPal.Me",
    "Or PayPal email": "Email",
    "Wise email": "Email",
    "Or Wise payment link": "Link",
    "Venmo username": "Venmo",
    $Cashtag: "Cashtag",
    "Email or phone": "Send to",
    "Name it shows": "Name",
    "Revolut username": "Revolut",
    "Wallet address": "Address",
  }
  return map[f.label] ?? f.label
}

export const formatRate = (rate: number) => `${Number(rate.toFixed(3))}%`

export function formatQty(q: number) {
  return Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)))
}

/** Money on an invoice: always the invoice currency, never a sign flip like the account views. */
export const invoiceMoney = (n: number, currency: string) =>
  n < 0 ? `−${formatMoney(-n, currency)}` : formatMoney(n, currency)

export function partyLines(p: InvoiceParty) {
  return [p.address, p.email, p.phone, p.taxId]
    .flatMap((s) => (s ? s.split("\n") : []))
    .map((s) => s.trim())
    .filter(Boolean)
}

export const EMPTY_PARTY: InvoiceParty = {
  name: "",
  email: "",
  phone: "",
  address: "",
  taxId: "",
}

/** Where the person you bill opens the invoice. */
export const shareUrl = (token: string) =>
  `${window.location.origin}/i/${token}`

export function safeFileName(s: string) {
  return (
    s
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "invoice"
  )
}
