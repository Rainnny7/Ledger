import { demoMode } from './demo'

export type AccountType = 'chequing' | 'savings' | 'credit' | 'loan' | 'investment' | 'wallet' | 'other'

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

export type Category =
  | 'income'
  | 'transfers'
  | 'food'
  | 'groceries'
  | 'transport'
  | 'shopping'
  | 'subscriptions'
  | 'bills'
  | 'entertainment'
  | 'health'
  | 'fees'
  | 'debt'
  | 'cash'
  | 'other'

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
  categorySource: 'auto' | 'rule' | 'manual'
}

export type PresetCycle = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'biennial' | 'triennial'
export type CycleUnit = 'weeks' | 'months' | 'years'
/** A preset billing period, or a custom one like `every-5-years`. */
export type Cycle = PresetCycle | `every-${number}-${CycleUnit}`

export interface Subscription {
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
  payments: { id: string; date: string; amount: number; accountId: string; pending: boolean }[]
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

export type GoalKind = 'save' | 'payoff'
export type GoalStatus = 'done' | 'ahead' | 'on-track' | 'behind' | 'overdue' | 'no-date'

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

export interface Goal {
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

export type GoalPaymentInput = { amount: number; date: string; note?: string | null; transactionId?: string | null }

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid'

export interface WorkPayment {
  id: string
  invoiceId: string
  amount: number
  date: string
  note: string | null
  transactionId: string | null
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

export interface WorkJob {
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

export type WorkPaymentInput = { amount: number; date: string; note?: string | null; transactionId?: string | null }

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

export type InvoiceDocStatus = 'draft' | 'sent' | 'void'
export type InvoicePayState = 'unpaid' | 'partial' | 'paid'

export type PaymentMethodKind =
  | 'etransfer'
  | 'paypal'
  | 'paypal-checkout'
  | 'crypto'
  | 'bank'
  | 'wise'
  | 'venmo'
  | 'cashapp'
  | 'zelle'
  | 'revolut'
  | 'link'
  | 'cheque'
  | 'cash'
  | 'other'

export interface PaymentMethod {
  id: string
  kind: PaymentMethodKind
  label: string
  fields: Record<string, string>
  isDefault: boolean
}

export type PaymentMethodInput = Omit<PaymentMethod, 'id'>

/** A payment method as the person you bill sees it. */
export type PublicPaymentMethod = Omit<PaymentMethod, 'isDefault'>

export interface InvoicePayment {
  id: string
  amount: number
  date: string
  method: string | null
  note: string | null
  source: 'manual' | 'work' | 'paypal'
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
export type PublicInvoice = Omit<InvoiceInput, 'methodIds' | 'workInvoiceId'> & InvoiceTotalsView & { methods: PublicPaymentMethod[] }

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

export type InvoicePaymentInput = { amount: number; date: string; method?: string | null; note?: string | null; transactionId?: string | null }

export interface MfaOption {
  id: string
  label: string
}

export type ConnectStep =
  | { type: 'success' }
  | { type: 'syncing'; message: string }
  | { type: 'done'; connectionId: string }
  | { type: 'mfa_select'; prompt: string; options: MfaOption[] }
  | { type: 'mfa_code'; prompt: string }
  | { type: 'mfa_push'; prompt: string }
  | { type: 'error'; message: string }

export interface SessionView {
  sessionId: string
  step: ConnectStep
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Fired after anything is created, changed or deleted; the query cache refetches what's on screen. */
export const DATA_CHANGED = 'ledger:data-changed'
export function notifyDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED))
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/banks${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(demoMode ? { 'X-Ledger-Demo': '1' } : {}), ...init.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText)
  if (init.method && init.method !== 'GET') notifyDataChanged()
  return data as T
}

export const api = {
  overview: () => request<{ connections: Connection[]; accounts: Account[] }>('/connections'),
  account: (id: string) => request<{ account: Account; transactions: Transaction[] }>(`/accounts/${id}`),
  accountDetails: (id: string) =>
    request<{ details: AccountDetails | null; updatedAt: string | null }>(`/accounts/${id}/details`),
  deleteConnection: (id: string) => request<{ ok: true }>(`/connections/${id}`, { method: 'DELETE' }),
  forgetCredentials: (id: string) => request<{ ok: true }>(`/connections/${id}/forget-credentials`, { method: 'POST' }),

  connect: (
    provider: string,
    body: { username?: string; password?: string; remember?: boolean; connectionId?: string; full?: boolean },
  ) => request<SessionView>(`/connect/${provider}`, { method: 'POST', body: JSON.stringify(body) }),
  pollSession: (id: string) => request<SessionView>(`/connect/sessions/${id}`),
  chooseMfa: (id: string, optionId: string) =>
    request<SessionView>(`/connect/sessions/${id}/mfa`, { method: 'POST', body: JSON.stringify({ optionId }) }),
  submitCode: (id: string, code: string) =>
    request<SessionView>(`/connect/sessions/${id}/code`, { method: 'POST', body: JSON.stringify({ code }) }),
  cancelSession: (id: string) => request<{ ok: true }>(`/connect/sessions/${id}`, { method: 'DELETE' }),

  transactions: (from?: string) => request<{ transactions: Transaction[] }>(`/transactions${from ? `?from=${from}` : ''}`),
  updateTransaction: (
    id: string,
    body: { category?: Category | null; applyToMerchant?: boolean; note?: string | null },
  ) => request<{ transaction: Transaction }>(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  subscriptions: () => request<{ subscriptions: Subscription[]; suggestions: RecurringSuggestion[] }>('/subscriptions'),
  createSubscription: (body: SubscriptionInput) =>
    request<{ id: string }>('/subscriptions', { method: 'POST', body: JSON.stringify(body) }),
  updateSubscription: (id: string, body: Partial<SubscriptionInput>) =>
    request<{ ok: true }>(`/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSubscription: (id: string) => request<{ ok: true }>(`/subscriptions/${id}`, { method: 'DELETE' }),
  dismissSuggestion: (id: string) =>
    request<{ ok: true }>('/subscriptions/dismiss', { method: 'POST', body: JSON.stringify({ id }) }),

  goals: () => request<{ goals: Goal[] }>('/goals'),
  createGoal: (body: GoalInput) => request<{ goal: Goal }>('/goals', { method: 'POST', body: JSON.stringify(body) }),
  updateGoal: (id: string, body: Partial<Omit<GoalInput, 'startingAmount'>>) =>
    request<{ goal: Goal }>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteGoal: (id: string) => request<{ ok: true }>(`/goals/${id}`, { method: 'DELETE' }),
  addGoalPayment: (id: string, body: GoalPaymentInput) =>
    request<{ goal: Goal }>(`/goals/${id}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteGoalPayment: (id: string, paymentId: string) =>
    request<{ goal: Goal }>(`/goals/${id}/payments/${paymentId}`, { method: 'DELETE' }),

  work: () => request<{ jobs: WorkJob[] }>('/work'),
  createWorkJob: (body: WorkJobInput) => request<{ job: WorkJob }>('/work/jobs', { method: 'POST', body: JSON.stringify(body) }),
  updateWorkJob: (id: string, body: Partial<WorkJobInput>) =>
    request<{ job: WorkJob }>(`/work/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWorkJob: (id: string) => request<{ ok: true }>(`/work/jobs/${id}`, { method: 'DELETE' }),
  addWorkEntry: (jobId: string, body: { date: string; hours: number; note?: string | null }) =>
    request<{ job: WorkJob }>(`/work/jobs/${jobId}/entries`, { method: 'POST', body: JSON.stringify(body) }),
  deleteWorkEntry: (id: string) => request<{ job: WorkJob }>(`/work/entries/${id}`, { method: 'DELETE' }),
  createWorkInvoice: (jobId: string, body: WorkInvoiceInput) =>
    request<{ job: WorkJob }>(`/work/jobs/${jobId}/invoices`, { method: 'POST', body: JSON.stringify(body) }),
  updateWorkInvoice: (id: string, body: Partial<Omit<WorkInvoiceInput, 'entryIds'>>) =>
    request<{ job: WorkJob }>(`/work/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteWorkInvoice: (id: string) => request<{ job: WorkJob }>(`/work/invoices/${id}`, { method: 'DELETE' }),
  addWorkPayment: (invoiceId: string, body: WorkPaymentInput) =>
    request<{ job: WorkJob }>(`/work/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteWorkPayment: (id: string) => request<{ job: WorkJob }>(`/work/payments/${id}`, { method: 'DELETE' }),

  invoices: () => request<InvoicesData>('/invoices'),
  createInvoice: (body: InvoiceInput) => request<{ invoice: Invoice }>('/invoices', { method: 'POST', body: JSON.stringify(body) }),
  updateInvoice: (id: string, body: Partial<InvoiceInput>) =>
    request<{ invoice: Invoice }>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteInvoice: (id: string) => request<{ ok: true }>(`/invoices/${id}`, { method: 'DELETE' }),
  resetInvoiceLink: (id: string) => request<{ invoice: Invoice }>(`/invoices/${id}/reset-link`, { method: 'POST' }),
  addInvoicePayment: (id: string, body: InvoicePaymentInput) =>
    request<{ invoice: Invoice }>(`/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  deleteInvoicePayment: (id: string, paymentId: string) =>
    request<{ invoice: Invoice }>(`/invoices/${id}/payments/${paymentId}`, { method: 'DELETE' }),
  saveInvoiceProfile: (body: InvoiceProfile) =>
    request<{ profile: InvoiceProfile; nextNumber: string }>('/invoice-profile', { method: 'PUT', body: JSON.stringify(body) }),
  createPaymentMethod: (body: PaymentMethodInput) =>
    request<{ method: PaymentMethod; methods: PaymentMethod[] }>('/payment-methods', { method: 'POST', body: JSON.stringify(body) }),
  updatePaymentMethod: (id: string, body: PaymentMethodInput) =>
    request<{ methods: PaymentMethod[] }>(`/payment-methods/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePaymentMethod: (id: string) => request<{ methods: PaymentMethod[] }>(`/payment-methods/${id}`, { method: 'DELETE' }),

  enableInstantUpdates: (connectionId: string) =>
    request<{ ok: true; url: string }>(`/connections/${connectionId}/instant-updates`, { method: 'POST' }),
  disableInstantUpdates: (connectionId: string) =>
    request<{ ok: true }>(`/connections/${connectionId}/instant-updates`, { method: 'DELETE' }),
}

/** The share link: no sign-in, so it skips the signed-in /api/banks helper. */
async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/public${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText)
  return data as T
}

export const publicApi = {
  invoice: (token: string) => publicRequest<{ invoice: PublicInvoice }>(`/invoices/${encodeURIComponent(token)}`),
  startPaypal: (token: string) => publicRequest<{ url: string }>(`/invoices/${encodeURIComponent(token)}/paypal`, { method: 'POST' }),
  capturePaypal: (token: string, orderId: string) =>
    publicRequest<{ invoice: PublicInvoice | null }>(`/invoices/${encodeURIComponent(token)}/paypal/capture`, {
      method: 'POST',
      body: JSON.stringify({ orderId }),
    }),
}
