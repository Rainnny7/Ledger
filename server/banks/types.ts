import type { AccountDetails } from "./td/parse.ts"

/** `wallet`: a stored-value balance such as PayPal; counted with bank accounts. */
export type AccountType =
	| "chequing"
	| "savings"
	| "credit"
	| "loan"
	| "investment"
	| "wallet"
	| "other"

/** Shape of ScrapedAccount as stored and returned by the API. */
export interface ScrapedAccount {
	externalKey: string
	name: string
	type: AccountType
	numberMasked: string | null
	currency: string
	balance: number | null
	available: number | null
	overdraftLimit: number | null
	overdraftUsed: number | null
	creditLimit: number | null
	transactions: ScrapedTransaction[]
	/** Earliest date the history filter was set to (null when only the default window was read). */
	historyFrom: string | null
	/** Direct deposit numbers and limits, when the bank showed them. */
	details: AccountDetails | null
}

/** Shape of ScrapedTransaction as stored and returned by the API. */
export interface ScrapedTransaction {
	date: string // YYYY-MM-DD
	description: string
	amount: number // negative = money out of the account
	runningBalance: number | null
	pending: boolean
	/** The provider's own id, when it has one; deduplicates more reliably than date + text + amount. */
	externalId?: string
}

/** Shape of MfaOption as stored and returned by the API. */
export interface MfaOption {
	id: string
	label: string
}

/**
 * One sign-in conversation with a provider. Browser-driven banks implement every step; API-based
 * ones (PayPal) succeed or fail straight from `login` and never reach the 2FA steps.
 */
export interface BankClient {
	open(storageState?: unknown): Promise<void>
	login(username: string, password: string): Promise<LoginStep>
	chooseMfa(optionId: string): Promise<LoginStep>
	submitCode(code: string): Promise<LoginStep>
	waitForApproval(): Promise<LoginStep>
	/** `sinceFor(externalKey)`: earliest date worth reading for that account, or null for a full read. */
	scrapeAccounts(
		onProgress?: (message: string) => void,
		sinceFor?: (externalKey: string) => string | null
	): Promise<ScrapedAccount[]>
	storageState(): Promise<unknown>
	close(): Promise<void>
}

/** Where a bank login currently stands; the UI renders one screen per step. */
export type LoginStep =
	| { type: "success" }
	| { type: "mfa_select"; prompt: string; options: MfaOption[] }
	| { type: "mfa_code"; prompt: string }
	| { type: "mfa_push"; prompt: string }
	| { type: "error"; message: string }
