/** Invoice helpers shared by the editor, the PDF and the public share page. */
import type {
	InvoiceParty,
	PaymentMethodKind,
	PublicPaymentMethod,
} from "./api"
import { formatMoney } from "./format"

/** Invoice PDF layout options in the editor. */
export const TEMPLATES = [
	{ id: "modern", label: "Modern" },
	{ id: "minimal", label: "Minimal" },
	{ id: "classic", label: "Classic" },
] as const
/** Template id union for typed invoice settings. */
export type InvoiceTemplate = (typeof TEMPLATES)[number]["id"]

/** Colour themes for invoice PDFs and the public share page. */
export const THEMES = [
	{ id: "professional", label: "Professional", swatch: "#18181b" },
	{ id: "modern", label: "Slate", swatch: "#334155" },
	{ id: "elegant", label: "Elegant", swatch: "#78350f" },
	{ id: "corporate", label: "Corporate", swatch: "#0f4c81" },
	{ id: "forest", label: "Forest", swatch: "#15803d" },
	{ id: "vivid", label: "Vivid", swatch: "#6d28d9" },
] as const
/** Theme id union for typed invoice settings. */
export type InvoiceTheme = (typeof THEMES)[number]["id"]

/** One field on a payment method form (label, validation, copy behaviour). */
export interface MethodField {
	key: string
	label: string
	placeholder?: string
	required?: boolean
	multiline?: boolean
	/** Shown to the payer with a copy button. */
	copy?: boolean
}

/** A payment kind with its picker label and field schema. */
export interface MethodKind {
	kind: PaymentMethodKind
	label: string
	/** One line under the name in the picker. */
	hint: string
	fields: MethodField[]
}

/** Every built-in payment method kind and how to collect its details. */
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
			{
				key: "name",
				label: "Name on the account",
				placeholder: "Optional",
			},
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
			{
				key: "contact",
				label: "Email or phone",
				required: true,
				copy: true,
			},
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
			{
				key: "note",
				label: "Note",
				placeholder: "e.g. Card or Apple Pay",
			},
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
		fields: [
			{ key: "note", label: "Instructions", placeholder: "Optional" },
		],
	},
	{
		kind: "other",
		label: "Other",
		hint: "Anything else, in your words",
		fields: [
			{
				key: "details",
				label: "Details",
				required: true,
				multiline: true,
			},
		],
	},
]

/** Definition row for a payment method kind (defaults to "other"). */
export const methodKind = (kind: PaymentMethodKind) =>
	METHOD_KINDS.find((entry) => entry.kind === kind) ?? METHOD_KINDS.at(-1)!

/** Whether the fields are enough to pay with. */
export function methodComplete(
	kind: PaymentMethodKind,
	fields: Record<string, string>
) {
	const def = methodKind(kind)
	if (kind === "paypal") {
		return !!(fields.handle?.trim() || fields.email?.trim())
	}
	if (kind === "wise") {
		return !!(fields.email?.trim() || fields.url?.trim())
	}
	if (kind === "bank") {
		return !!(fields.account?.trim() || fields.iban?.trim())
	}
	if (kind === "paypal-checkout") {
		return !!fields.connectionId
	}
	return def.fields
		.filter((field) => field.required)
		.every((field) => fields[field.key]?.trim())
}

const clean = (text: string | undefined) => (text ?? "").trim()
const handleOf = (text: string | undefined) =>
	clean(text)
		.replace(/^[@$]/, "")
		.replace(/^https?:\/\/\S+\//, "")

/** A link that opens the payment with the amount filled in, where the service supports one. */
export function payLink(
	method: Pick<PublicPaymentMethod, "kind" | "fields">,
	amount: number,
	currency: string
): string | null {
	const fields = method.fields
	const amt = amount > 0 ? amount.toFixed(2) : ""
	switch (method.kind) {
		case "paypal": {
			const handle = handleOf(fields.handle)
			return handle
				? `https://paypal.me/${encodeURIComponent(handle)}${amt ? `/${amt}${currency}` : ""}`
				: null
		}
		case "venmo": {
			const handle = handleOf(fields.handle)
			return handle
				? `https://venmo.com/${encodeURIComponent(handle)}?txn=pay${amt ? `&amount=${amt}` : ""}`
				: null
		}
		case "cashapp": {
			const handle = handleOf(fields.handle)
			return handle
				? `https://cash.app/$${encodeURIComponent(handle)}${amt ? `/${amt}` : ""}`
				: null
		}
		case "revolut": {
			const handle = handleOf(fields.handle)
			return handle
				? `https://revolut.me/${encodeURIComponent(handle)}${amt ? `?amount=${Math.round(amount * 100)}&currency=${currency}` : ""}`
				: null
		}
		case "wise":
		case "link":
			return /^https:\/\//i.test(clean(fields.url))
				? clean(fields.url)
				: null
		default:
			return null
	}
}

/** The value the payer can scan: a pay link, or a wallet address. */
export function qrValue(
	method: Pick<PublicPaymentMethod, "kind" | "fields">,
	amount: number,
	currency: string
) {
	if (method.kind === "crypto") {
		return clean(method.fields.address) || null
	}
	return payLink(method, amount, currency)
}

/** The method as label/value lines, the way the PDF and the share page list it. */
export function methodLines(
	method: Pick<PublicPaymentMethod, "kind" | "fields">
): { label: string; value: string; copy: boolean }[] {
	const def = methodKind(method.kind)
	const lines = def.fields
		.filter((field) => clean(method.fields[field.key]))
		.map((field) => ({
			label: shortLabel(field),
			value: clean(method.fields[field.key]),
			copy: !!field.copy,
		}))
	if (method.kind === "cashapp") {
		return lines.map((line) => ({
			...line,
			value: `$${handleOf(line.value)}`,
		}))
	}
	if (method.kind === "paypal") {
		return lines.map((line) =>
			line.label === "PayPal.Me"
				? { ...line, value: `paypal.me/${handleOf(line.value)}` }
				: line
		)
	}
	return lines
}

function shortLabel(field: MethodField) {
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
	return map[field.label] ?? field.label
}

/** Percentage rate for invoice tax lines (up to three decimals). */
export const formatRate = (rate: number) => `${Number(rate.toFixed(3))}%`

/** Quantity on a line item: integers bare, else up to three decimals. */
export function formatQty(quantity: number) {
	return Number.isInteger(quantity)
		? String(quantity)
		: String(Number(quantity.toFixed(3)))
}

/** Money on an invoice: always the invoice currency, never a sign flip like the account views. */
export const invoiceMoney = (amount: number, currency: string) =>
	amount < 0
		? `−${formatMoney(-amount, currency)}`
		: formatMoney(amount, currency)

/** Non-empty contact lines from a party block (address, email, phone, tax id). */
export function partyLines(party: InvoiceParty) {
	return [party.address, party.email, party.phone, party.taxId]
		.flatMap((line) => (line ? line.split("\n") : []))
		.map((line) => line.trim())
		.filter(Boolean)
}

/** Blank party used as the default in new invoices. */
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

/** Safe attachment name from invoice title or number. */
export function safeFileName(text: string) {
	return (
		text
			.replace(/[^\w.-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "") || "invoice"
	)
}
