import { authClient } from "./auth-client"
import { DEMO_READ_ONLY, demoMode, demoPersona } from "./demo"

export type AccountType =
  | "chequing"
  | "savings"
  | "credit"
  | "loan"
  | "investment"
  | "wallet"
  | "other"

export interface Connection {
  id: string
  institution: string
  label: string
  usernameMasked: string
  status: string
  lastSyncedAt: string | null
  lastError: string | null
  createdAt: string
  savedCredentials: boolean
  /** PayPal webhooks registered: payments made through the app arrive right away. */
  instantUpdates?: boolean
  lastEventAt?: string | null
  /** When the background refresh will next sync it on its own; null when it won't. */
  nextSyncAt?: string | null
  /** Auto-refresh hit a two-factor prompt and is paused until you sign in yourself. */
  needsSignIn?: boolean
}

export interface Account {
  id: string
  connectionId: string
  name: string
  type: AccountType
  numberMasked: string | null
  currency: string
  balance: number | null
  available: number | null
  overdraftLimit: number | null
  overdraftUsed: number | null
  creditLimit: number | null
  updatedAt: string
  transactionCount?: number
  /** Earliest date the full history read reached. */
  historyFrom?: string | null
  /** Whether direct deposit details / limits were captured (fetch them with api.accountDetails). */
  hasDetails?: boolean
}

export interface AccountLimit {
  label: string
  amount: number | null
  text: string | null
}

export interface AccountDetails {
  accountNumber: string | null
  transit: string | null
  institution: string | null
  limits: AccountLimit[]
}

import type { Category, Cycle, TaxTag } from "../../shared/categories.ts"
export type {
  Category,
  Cycle,
  CycleUnit,
  PresetCycle,
  TaxTag,
} from "../../shared/categories.ts"

export interface Transaction {
  id: string
  accountId: string
  date: string
  description: string
  amount: number
  runningBalance: number | null
  pending: boolean
  note: string | null
  /** When this sync first saw the transaction (SQLite UTC). TD only gives a posting date. */
  createdAt: string
  merchant: string
  merchantKey: string
  category: Category
  categorySource: "auto" | "rule" | "manual"
  /** Business or personal, for the tax report; null while untagged. */
  taxTag: TaxTag | null
  /** manual: this transaction · rule: every one from the merchant · auto: a payment for your bill or invoice. */
  taxTagSource: "auto" | "rule" | "manual" | null
}

/** A monthly spending limit for one category, in the user's home currency. */
export interface Budget {
  category: Category
  amount: number
  currency: string
  updatedAt: string
}

export type ShareKind = "goal" | "subscription" | "job"
export type SharePermission = "view" | "edit"
export type ShareRole = "owner" | SharePermission

export interface Share {
  id: string
  email: string
  /** Your contact name for them. */
  name: string | null
  permission: SharePermission
}

/** Who can see a goal, subscription or job, and what you can do with it. */
export interface Shared {
  access: ShareRole
  /** Set when someone else owns it and shared it with you. */
  owner: { name: string; email: string } | null
  /** Who you've shared it with (your own items only). */
  sharedWith: Share[]
}

export interface Contact {
  id: string
  email: string
  name: string | null
  createdAt: string
}

export interface Subscription extends Shared {
  id: string
  name: string
  amount: number
  currency: string
  cycle: Cycle
  anchorDate: string
  category: Category
  accountId: string | null
  merchantKey: string | null
  notes: string | null
  active: boolean
  createdAt: string
  nextDue: string
  monthly: number
  lastCharge: { date: string; amount: number } | null
  /** accountId is null on someone else's subscription. */
  /** Charges counted toward it, newest first; `linked` ones were counted by hand. */
  payments: {
    id: string
    date: string
    amount: number
    accountId: string | null
    pending: boolean
    linked: boolean
  }[]
}

export interface RecurringSuggestion {
  /** Stable suggestion id (merchant key + rounded amount); pass it to dismissSuggestion. */
  id: string
  merchantKey: string
  name: string
  category: Category
  amount: number
  cycle: Cycle
  lastDate: string
  nextDue: string
  occurrences: number
  accountId: string | null
}

export type SubscriptionInput = {
  name: string
  amount: number
  currency?: string
  cycle: Cycle
  anchorDate: string
  category?: Category
  accountId?: string | null
  merchantKey?: string | null
  notes?: string | null
  active?: boolean
}

export type GoalKind = "save" | "payoff"
export type GoalStatus =
  | "done"
  | "ahead"
  | "on-track"
  | "behind"
  | "overdue"
  | "no-date"

export interface GoalPayment {
  id: string
  goalId: string
  /** Positive toward the goal; negative = taken back out. */
  amount: number
  date: string
  note: string | null
  transactionId: string | null
  createdAt: string
}

export interface Goal extends Shared {
  id: string
  name: string
  kind: GoalKind
  target: number
  currency: string
  targetDate: string | null
  icon: string
  color: string
  notes: string | null
  archived: boolean
  createdAt: string
  saved: number
  remaining: number
  /** 0–1 */
  progress: number
  completedAt: string | null
  status: GoalStatus
  daysLeft: number | null
  neededPerMonth: number | null
  neededPerWeek: number | null
  pacePerMonth: number
  projectedDate: string | null
  /** Newest first. */
  payments: GoalPayment[]
}

export type GoalInput = {
  name: string
  kind?: GoalKind
  target: number
  currency?: string
  targetDate?: string | null
  icon?: string
  color?: string
  notes?: string | null
  archived?: boolean
  startingAmount?: number
}

export type GoalPaymentInput = {
  amount: number
  date: string
  note?: string | null
  transactionId?: string | null
}

export type InvoiceStatus = "unpaid" | "partial" | "paid"

export interface WorkPayment {
  id: string
  invoiceId: string
  amount: number
  date: string
  note: string | null
  transactionId: string | null
  /** Set when the money arrived converted: the amount and currency that landed. */
  receivedAmount?: number | null
  receivedCurrency?: string | null
  createdAt: string
  /** Still owed on the bill after this payment. */
  remainingAfter: number
}

export interface WorkInvoice {
  id: string
  jobId: string
  date: string
  hours: number
  rate: number
  total: number
  counterHours: number | null
  proofUrl: string | null
  note: string | null
  createdAt: string
  paid: number
  remaining: number
  overpaid: number
  status: InvoiceStatus
  progress: number
  paidAt: string | null
  /** Oldest first. */
  payments: WorkPayment[]
}

export interface WorkEntry {
  id: string
  jobId: string
  date: string
  hours: number
  note: string | null
  invoiceId: string | null
  createdAt: string
}

export interface WorkJob extends Shared {
  id: string
  name: string
  rate: number
  currency: string
  payAmount: number | null
  payEveryDays: number | null
  color: string
  notes: string | null
  archived: boolean
  createdAt: string
  owed: number
  billedHours: number
  billedTotal: number
  paidTotal: number
  paidThisMonth: number
  unbilledHours: number
  unbilledValue: number
  lastCounter: number | null
  lastPaymentDate: string | null
  nextPaymentDate: string | null
  paymentsLeft: number | null
  payoffDate: string | null
  /** Newest first. */
  invoices: WorkInvoice[]
  /** Logged shifts not on a bill yet, newest first. */
  unbilled: WorkEntry[]
}

export type WorkJobInput = {
  name: string
  rate: number
  currency?: string
  payAmount?: number | null
  payEveryDays?: number | null
  color?: string
  notes?: string | null
  archived?: boolean
}

export type WorkInvoiceInput = {
  date: string
  hours: number
  rate: number
  total?: number
  counterHours?: number | null
  proofUrl?: string | null
  note?: string | null
  entryIds?: string[]
}

export type WorkPaymentInput = {
  amount: number
  date: string
  note?: string | null
  transactionId?: string | null
  receivedAmount?: number | null
  receivedCurrency?: string | null
}

/** Daily reference rates: 1 `base` = `rates[code]` of that currency. */
export interface FxRates {
  base: string
  date: string
  rates: Record<string, number>
  fetchedAt: string | null
  /** 'live' for current market rates, 'ecb' for the ECB's once-a-day fixing. */
  source: "live" | "ecb"
}

// ---------------------------------------------------------------- invoices

export interface InvoiceParty {
  name: string
  email: string
  phone: string
  address: string
  taxId: string
}

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
}

export type InvoiceDocStatus = "draft" | "sent" | "void"
export type InvoicePayState = "unpaid" | "partial" | "paid"

export type PaymentMethodKind =
  | "etransfer"
  | "paypal"
  | "paypal-checkout"
  | "crypto"
  | "bank"
  | "wise"
  | "venmo"
  | "cashapp"
  | "zelle"
  | "revolut"
  | "link"
  | "cheque"
  | "cash"
  | "other"

export interface PaymentMethod {
  id: string
  kind: PaymentMethodKind
  label: string
  fields: Record<string, string>
  isDefault: boolean
}

export type PaymentMethodInput = Omit<PaymentMethod, "id">

/** A payment method as the person you bill sees it. */
export type PublicPaymentMethod = Omit<PaymentMethod, "isDefault">

export interface InvoicePayment {
  id: string
  amount: number
  date: string
  method: string | null
  note: string | null
  source: "manual" | "work" | "paypal"
  transactionId: string | null
}

/** What you fill in on an invoice. */
export interface InvoiceInput {
  number: string
  status: InvoiceDocStatus
  template: string
  theme: string
  currency: string
  issueDate: string
  dueDate: string | null
  from: InvoiceParty
  client: InvoiceParty
  items: InvoiceItem[]
  taxRate: number
  taxLabel: string
  discount: number
  notes: string | null
  terms: string | null
  methodIds: string[]
  workInvoiceId: string | null
}

export interface InvoiceTotalsView {
  subtotal: number
  tax: number
  total: number
  paid: number
  balance: number
  payState: InvoicePayState
}

export interface Invoice extends InvoiceInput, InvoiceTotalsView {
  id: string
  token: string
  sentAt: string | null
  viewedAt: string | null
  createdAt: string
  updatedAt: string
  payments: InvoicePayment[]
}

/** The share-link view: no internal ids, payment methods resolved. */
export type PublicInvoice = Omit<InvoiceInput, "methodIds" | "workInvoiceId"> &
  InvoiceTotalsView & { methods: PublicPaymentMethod[] }

export interface InvoiceProfile {
  from: InvoiceParty
  prefix: string
  template: string
  theme: string
  currency: string
  taxRate: number
  taxLabel: string
  dueDays: number | null
  notes: string
  terms: string
}

export interface PaypalAppConnection {
  id: string
  label: string
  usernameMasked: string
  instantUpdates: boolean
  lastEventAt: string | null
}

export interface InvoicesData {
  invoices: Invoice[]
  methods: PaymentMethod[]
  profile: InvoiceProfile
  nextNumber: string
  paypal: PaypalAppConnection[]
}

export type InvoicePaymentInput = {
  amount: number
  date: string
  method?: string | null
  note?: string | null
  transactionId?: string | null
}

export interface MfaOption {
  id: string
  label: string
}

export type ConnectStep =
  | { type: "success" }
  | { type: "syncing"; message: string }
  | { type: "done"; connectionId: string }
  | { type: "mfa_select"; prompt: string; options: MfaOption[] }
  | { type: "mfa_code"; prompt: string }
  | { type: "mfa_push"; prompt: string }
  | { type: "error"; message: string }

export interface SessionView {
  sessionId: string
  step: ConnectStep
}

export interface StatementImport {
  files: {
    name: string
    status: "imported" | "duplicate" | "error"
    message?: string
    accountNumber?: string
    from?: string
    to?: string
  }[]
  accounts: {
    accountId: string
    name: string
    numberMasked: string
    created: boolean
    statements: number
    added: number
    existing: number
    from: string
    to: string
    gaps: { from: string; to: string }[]
  }[]
}

export type UpdateInfo = {
  current: string
  latest: string | null
  available: boolean
  url: string | null
  notes: string | null
  publishedAt: string | null
  install: "docker" | "source"
  commands: string[]
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fired after anything is created, changed or deleted; the query cache refetches what's on screen. */
export const DATA_CHANGED = "ledger:data-changed"
/** Fired with the saved transaction after a single-row edit, so cached lists can show it right away. */
export const TRANSACTION_UPDATED = "ledger:transaction-updated"
/** `path` is the API path that changed (e.g. `/goals/abc`); without one, everything is refetched. */
export function notifyDataChanged(path?: string) {
  window.dispatchEvent(
    new CustomEvent<string | undefined>(DATA_CHANGED, { detail: path })
  )
}

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

/** `notify: false` leaves telling the cache what changed to the caller. */
async function request<T>(
  path: string,
  init: RequestInit & { notify?: boolean } = {}
): Promise<T> {
  // Demo mode lets you open every form, but nothing is ever written: refuse here, before the
  // request goes out (the server refuses it too). Callers show the message like any other error.
  if (demoMode && init.method && init.method !== "GET")
    throw new ApiError(403, DEMO_READ_ONLY)
  const res = await fetch(`/api/banks${path}`, {
    ...init,
    credentials: "include",
    // Multipart bodies need the browser's own Content-Type (it carries the boundary).
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(demoMode ? { "X-Ledger-Demo": demoPersona.id } : {}),
      // Due dates and deadlines are worked out for "today" where you are.
      "X-Timezone": TIME_ZONE,
      ...init.headers,
    },
  })
  // Signed out elsewhere or the session ran out: re-check it, and the app falls back to the sign-in page.
  if (res.status === 401) authClient.$store.notify("$sessionSignal")
  if (!res.ok) throw await apiError(res)
  const data = await res.json().catch(() => ({}))
  if (init.method && init.method !== "GET" && init.notify !== false)
    notifyDataChanged(path)
  return data as T
}

async function adminRequest<T>(path: string): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  })
  if (res.status === 401) authClient.$store.notify("$sessionSignal")
  if (!res.ok) throw await apiError(res)
  return (await res.json().catch(() => ({}))) as T
}

/** The error for a failed response: the server's `error` message, else the status text. */
async function apiError(res: Response) {
  const data = await res.json().catch(() => ({}))
  return new ApiError(
    res.status,
    (data as { error?: string }).error ?? res.statusText
  )
}

export const api = {
  fx: () => request<FxRates>("/fx"),
  overview: () =>
    request<{ connections: Connection[]; accounts: Account[] }>("/connections"),
  account: (id: string) =>
    request<{ account: Account; transactions: Transaction[] }>(
      `/accounts/${id}`
    ),
  accountDetails: (id: string) =>
    request<{ details: AccountDetails | null; updatedAt: string | null }>(
      `/accounts/${id}/details`
    ),
  deleteConnection: (id: string) =>
    request<{ ok: true }>(`/connections/${id}`, { method: "DELETE" }),
  forgetCredentials: (id: string) =>
    request<{ ok: true }>(`/connections/${id}/forget-credentials`, {
      method: "POST",
    }),

  connect: (
    provider: string,
    body: {
      username?: string
      password?: string
      remember?: boolean
      connectionId?: string
      full?: boolean
    }
  ) =>
    request<SessionView>(`/connect/${provider}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  pollSession: (id: string) => request<SessionView>(`/connect/sessions/${id}`),
  chooseMfa: (id: string, optionId: string) =>
    request<SessionView>(`/connect/sessions/${id}/mfa`, {
      method: "POST",
      body: JSON.stringify({ optionId }),
    }),
  submitCode: (id: string, code: string) =>
    request<SessionView>(`/connect/sessions/${id}/code`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  cancelSession: (id: string) =>
    request<{ ok: true }>(`/connect/sessions/${id}`, { method: "DELETE" }),

  /** TD statement PDFs or .zip archives of them. */
  importStatements: (files: File[], connectionId?: string) => {
    const body = new FormData()
    for (const f of files) body.append("files", f)
    if (connectionId) body.append("connectionId", connectionId)
    return request<StatementImport>("/statements", { method: "POST", body })
  },

  transactions: (from?: string) =>
    request<{ transactions: Transaction[] }>(
      `/transactions${from ? `?from=${from}` : ""}`
    ),
  updateTransaction: async (
    id: string,
    body: {
      category?: Category | null
      applyToMerchant?: boolean
      note?: string | null
      taxTag?: TaxTag | null
      applyTaxToMerchant?: boolean
    }
  ) => {
    const result = await request<{ transaction: Transaction }>(
      `/transactions/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        notify: false,
      }
    )
    // One row changed: the cached lists are patched in place. A merchant-wide rule changes many rows.
    const merchantWide =
      (body.category !== undefined && body.applyToMerchant === true) ||
      (body.taxTag !== undefined && body.applyTaxToMerchant === true)
    window.dispatchEvent(
      new CustomEvent(TRANSACTION_UPDATED, { detail: result.transaction })
    )
    notifyDataChanged(
      merchantWide ? "/transactions/merchant" : `/transactions/${id}`
    )
    return result
  },
  /** Files several transactions under one category in a single request. */
  updateTransactions: (
    ids: string[],
    change: { category: Category | null } | { taxTag: TaxTag | null }
  ) =>
    request<{ updated: number }>("/transactions/bulk", {
      method: "PATCH",
      body: JSON.stringify({ ids, ...change }),
      notify: false,
    }).then((r) => {
      notifyDataChanged("/transactions/merchant")
      return r
    }),

  budgets: () => request<{ budgets: Budget[] }>("/budgets"),
  setBudget: (category: Category, amount: number, currency: string) =>
    request<{ ok: true }>(`/budgets/${category}`, {
      method: "PUT",
      body: JSON.stringify({ amount, currency }),
    }),
  deleteBudget: (category: Category) =>
    request<{ ok: true }>(`/budgets/${category}`, { method: "DELETE" }),

  subscriptions: () =>
    request<{
      subscriptions: Subscription[]
      suggestions: RecurringSuggestion[]
    }>("/subscriptions"),
  createSubscription: (body: SubscriptionInput) =>
    request<{ id: string }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSubscription: (id: string, body: Partial<SubscriptionInput>) =>
    request<{ ok: true }>(`/subscriptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSubscription: (id: string) =>
    request<{ ok: true }>(`/subscriptions/${id}`, { method: "DELETE" }),
  /** Count a transaction toward a subscription, or (null) stop counting it by hand. */
  linkSubscriptionCharge: (
    transactionId: string,
    subscriptionId: string | null
  ) =>
    request<{ ok: true }>(`/subscriptions/charges/${transactionId}`, {
      method: "PUT",
      body: JSON.stringify({ subscriptionId }),
    }),
  dismissSuggestion: (id: string) =>
    request<{ ok: true }>("/subscriptions/dismiss", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

  goals: () => request<{ goals: Goal[] }>("/goals"),
  createGoal: (body: GoalInput) =>
    request<{ goal: Goal }>("/goals", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateGoal: (id: string, body: Partial<Omit<GoalInput, "startingAmount">>) =>
    request<{ goal: Goal }>(`/goals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteGoal: (id: string) =>
    request<{ ok: true }>(`/goals/${id}`, { method: "DELETE" }),
  addGoalPayment: (id: string, body: GoalPaymentInput) =>
    request<{ goal: Goal }>(`/goals/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteGoalPayment: (id: string, paymentId: string) =>
    request<{ goal: Goal }>(`/goals/${id}/payments/${paymentId}`, {
      method: "DELETE",
    }),

  work: () => request<{ jobs: WorkJob[] }>("/work"),
  createWorkJob: (body: WorkJobInput) =>
    request<{ job: WorkJob }>("/work/jobs", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateWorkJob: (id: string, body: Partial<WorkJobInput>) =>
    request<{ job: WorkJob }>(`/work/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteWorkJob: (id: string) =>
    request<{ ok: true }>(`/work/jobs/${id}`, { method: "DELETE" }),
  addWorkEntry: (
    jobId: string,
    body: { date: string; hours: number; note?: string | null }
  ) =>
    request<{ job: WorkJob }>(`/work/jobs/${jobId}/entries`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteWorkEntry: (id: string) =>
    request<{ job: WorkJob }>(`/work/entries/${id}`, { method: "DELETE" }),
  createWorkInvoice: (jobId: string, body: WorkInvoiceInput) =>
    request<{ job: WorkJob }>(`/work/jobs/${jobId}/invoices`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateWorkInvoice: (
    id: string,
    body: Partial<Omit<WorkInvoiceInput, "entryIds">>
  ) =>
    request<{ job: WorkJob }>(`/work/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteWorkInvoice: (id: string) =>
    request<{ job: WorkJob }>(`/work/invoices/${id}`, { method: "DELETE" }),
  addWorkPayment: (invoiceId: string, body: WorkPaymentInput) =>
    request<{ job: WorkJob }>(`/work/invoices/${invoiceId}/payments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteWorkPayment: (id: string) =>
    request<{ job: WorkJob }>(`/work/payments/${id}`, { method: "DELETE" }),

  contacts: () => request<{ contacts: Contact[] }>("/contacts"),
  addContact: (body: { email: string; name?: string | null }) =>
    request<{ contact: Contact }>("/contacts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateContact: (id: string, body: { name: string | null }) =>
    request<{ contact: Contact }>(`/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteContact: (id: string) =>
    request<{ ok: true }>(`/contacts/${id}`, { method: "DELETE" }),

  shares: (kind: ShareKind, itemId: string) =>
    request<{ shares: Share[] }>(`/shares/${kind}/${itemId}`),
  share: (
    kind: ShareKind,
    itemId: string,
    body: { email: string; permission: SharePermission }
  ) =>
    request<{ shares: Share[] }>(`/shares/${kind}/${itemId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateShare: (id: string, permission: SharePermission) =>
    request<{ ok: true }>(`/shares/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ permission }),
    }),
  unshare: (id: string) =>
    request<{ ok: true }>(`/shares/${id}`, { method: "DELETE" }),
  leaveShare: (kind: ShareKind, itemId: string) =>
    request<{ ok: true }>(`/shares/${kind}/${itemId}/me`, { method: "DELETE" }),

  invoices: () => request<InvoicesData>("/invoices"),
  createInvoice: (body: InvoiceInput) =>
    request<{ invoice: Invoice }>("/invoices", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateInvoice: (id: string, body: Partial<InvoiceInput>) =>
    request<{ invoice: Invoice }>(`/invoices/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteInvoice: (id: string) =>
    request<{ ok: true }>(`/invoices/${id}`, { method: "DELETE" }),
  resetInvoiceLink: (id: string) =>
    request<{ invoice: Invoice }>(`/invoices/${id}/reset-link`, {
      method: "POST",
    }),
  addInvoicePayment: (id: string, body: InvoicePaymentInput) =>
    request<{ invoice: Invoice }>(`/invoices/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteInvoicePayment: (id: string, paymentId: string) =>
    request<{ invoice: Invoice }>(`/invoices/${id}/payments/${paymentId}`, {
      method: "DELETE",
    }),
  saveInvoiceProfile: (body: InvoiceProfile) =>
    request<{ profile: InvoiceProfile; nextNumber: string }>(
      "/invoice-profile",
      { method: "PUT", body: JSON.stringify(body) }
    ),
  createPaymentMethod: (body: PaymentMethodInput) =>
    request<{ method: PaymentMethod; methods: PaymentMethod[] }>(
      "/payment-methods",
      { method: "POST", body: JSON.stringify(body) }
    ),
  updatePaymentMethod: (id: string, body: PaymentMethodInput) =>
    request<{ methods: PaymentMethod[] }>(`/payment-methods/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  deletePaymentMethod: (id: string) =>
    request<{ methods: PaymentMethod[] }>(`/payment-methods/${id}`, {
      method: "DELETE",
    }),

  enableInstantUpdates: (connectionId: string) =>
    request<{ ok: true; url: string }>(
      `/connections/${connectionId}/instant-updates`,
      { method: "POST" }
    ),
  disableInstantUpdates: (connectionId: string) =>
    request<{ ok: true }>(`/connections/${connectionId}/instant-updates`, {
      method: "DELETE",
    }),

  adviceDismissed: () =>
    request<{ dismissed: { id: string; until: string | null }[] }>(
      "/advice/dismissed"
    ),
  /** Hide an Advisor tip: for `days`, or for good without it. */
  dismissAdvice: (id: string, days?: number) =>
    request<{ ok: true }>("/advice/dismiss", {
      method: "POST",
      body: JSON.stringify({ id, days }),
    }),
  /** Bring back one hidden tip, or all of them without an id. */
  restoreAdvice: (id?: string) =>
    request<{ ok: true }>(
      `/advice/dismissed${id ? `?id=${encodeURIComponent(id)}` : ""}`,
      { method: "DELETE" }
    ),

  update: () => adminRequest<UpdateInfo>("/update"),
}

/** The share link: no sign-in, so it skips the signed-in /api/banks helper. */
async function publicRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`/api/public${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  })
  if (!res.ok) throw await apiError(res)
  return (await res.json().catch(() => ({}))) as T
}

export const publicApi = {
  invoice: (token: string) =>
    publicRequest<{ invoice: PublicInvoice }>(
      `/invoices/${encodeURIComponent(token)}`
    ),
  startPaypal: (token: string) =>
    publicRequest<{ url: string }>(
      `/invoices/${encodeURIComponent(token)}/paypal`,
      { method: "POST" }
    ),
  capturePaypal: (token: string, orderId: string) =>
    publicRequest<{ invoice: PublicInvoice | null }>(
      `/invoices/${encodeURIComponent(token)}/paypal/capture`,
      {
        method: "POST",
        body: JSON.stringify({ orderId }),
      }
    ),
}
