import { strToU8, zipSync } from "fflate"
import type { Account, Category, Transaction } from "./api.ts"
import { CATEGORY_LIST, CATEGORY_META, NON_SPEND } from "./categories.ts"
import { isoDate } from "./format.ts"

/**
 * The tax report: one period's money in and out, by category and by month, split into business
 * and personal, plus the loose ends worth fixing before it goes to an accountant.
 *
 * Amounts are expected in one currency (the caller converts with `inHomeCurrency`). Transfers
 * between your own accounts are left out of every total, as on Insights, so nothing counts twice.
 */

export interface CategoryLine {
	category: Category
	count: number
	moneyIn: number
	moneyOut: number
	businessIn: number
	businessOut: number
}

/** `MonthLine` type used in this module. */
export interface MonthLine {
	/** YYYY-MM */
	month: string
	moneyIn: number
	moneyOut: number
	businessIn: number
	businessOut: number
}

/** `TaxReport` type used in this module. */
export interface TaxReport {
	/** Pay and other money in filed under Income. */
	income: number
	/** Spending after refunds, not counting transfers or loan payments. */
	spending: number
	/** Loan and credit repayments: they pay down a balance, so they're shown on their own. */
	debtPayments: number
	businessIn: number
	businessOut: number
	personalOut: number
	count: number
	byCategory: CategoryLine[]
	byMonth: MonthLine[]
	review: {
		/** Filed under Other: an accountant can't tell what these were. */
		uncategorized: Transaction[]
		/** Money in that isn't tagged: is it business income, a gift, a refund? */
		untaggedIncome: Transaction[]
		/** Business expenses with nothing saying what they were for. */
		businessNoNote: Transaction[]
		/** Not posted yet, so the amount can still change. */
		pending: Transaction[]
	}
}

const round = (value: number) => Math.round(value * 100) / 100

/** Calendar years that have transactions, newest first (always includes the current year). */
export function reportYears(transactions: Transaction[], today = new Date()) {
	const years = new Set([today.getFullYear()])
	for (const transaction of transactions) {
		years.add(Number(transaction.date.slice(0, 4)))
	}
	return [...years]
		.filter(Number.isFinite)
		.toSorted((left, right) => right - left)
}

/** Most people file in spring for the year before; later in the year, the current one is more useful. */
export function defaultReportYear(years: number[], today = new Date()) {
	const current = today.getFullYear()
	const preferred = today.getMonth() < 5 ? current - 1 : current
	return years.includes(preferred) ? preferred : current
}

/** `inPeriod` for this feature area. */
export function inPeriod(transaction: Transaction, from: string, to: string) {
	return transaction.date >= from && transaction.date <= to
}

/** `buildTaxReport` for this feature area. */
export function buildTaxReport(transactions: Transaction[]): TaxReport {
	const cats = new Map<Category, CategoryLine>()
	const months = new Map<string, MonthLine>()
	const review: TaxReport["review"] = {
		uncategorized: [],
		untaggedIncome: [],
		businessNoNote: [],
		pending: [],
	}
	let income = 0
	let spending = 0
	let debtPayments = 0
	let businessIn = 0
	let businessOut = 0
	let personalOut = 0
	let count = 0

	for (const transaction of transactions) {
		if (transaction.pending) {
			review.pending.push(transaction)
		}
		if (transaction.category === "transfers") {
			continue
		}
		count++
		const business = transaction.taxTag === "business"
		const moneyIn = transaction.amount > 0 ? transaction.amount : 0
		const moneyOut = transaction.amount < 0 ? -transaction.amount : 0

		const line = cats.get(transaction.category) ?? {
			category: transaction.category,
			count: 0,
			moneyIn: 0,
			moneyOut: 0,
			businessIn: 0,
			businessOut: 0,
		}
		line.count++
		line.moneyIn += moneyIn
		line.moneyOut += moneyOut
		if (business) {
			line.businessIn += moneyIn
			line.businessOut += moneyOut
		}
		cats.set(transaction.category, line)

		const key = transaction.date.slice(0, 7)
		const month = months.get(key) ?? {
			month: key,
			moneyIn: 0,
			moneyOut: 0,
			businessIn: 0,
			businessOut: 0,
		}
		month.moneyIn += moneyIn
		month.moneyOut += moneyOut
		if (business) {
			month.businessIn += moneyIn
			month.businessOut += moneyOut
		}
		months.set(key, month)

		if (transaction.category === "income") {
			income += transaction.amount
		} else if (transaction.category === "debt") {
			debtPayments -= transaction.amount
		} else if (!NON_SPEND.has(transaction.category)) {
			spending -= transaction.amount
		}

		if (business) {
			businessIn += moneyIn
			businessOut += moneyOut
		} else if (
			transaction.category !== "income" &&
			transaction.category !== "debt"
		) {
			personalOut -= transaction.amount
		}

		if (transaction.category === "other") {
			review.uncategorized.push(transaction)
		}
		if (
			transaction.amount > 0 &&
			transaction.category === "income" &&
			!transaction.taxTag
		) {
			review.untaggedIncome.push(transaction)
		}
		if (business && transaction.amount < 0 && !transaction.note?.trim()) {
			review.businessNoNote.push(transaction)
		}
	}

	const order = new Map(
		CATEGORY_LIST.map((category, index) => [category, index])
	)
	return {
		income: round(income),
		spending: round(spending),
		debtPayments: round(debtPayments),
		businessIn: round(businessIn),
		businessOut: round(businessOut),
		personalOut: round(Math.max(0, personalOut)),
		count,
		byCategory: [...cats.values()]
			.map((line) => ({
				...line,
				moneyIn: round(line.moneyIn),
				moneyOut: round(line.moneyOut),
				businessIn: round(line.businessIn),
				businessOut: round(line.businessOut),
			}))
			.toSorted(
				(left, right) =>
					right.moneyOut +
						right.moneyIn -
						(left.moneyOut + left.moneyIn) ||
					order.get(left.category)! - order.get(right.category)!
			),
		byMonth: [...months.values()]
			.map((month) => ({
				...month,
				moneyIn: round(month.moneyIn),
				moneyOut: round(month.moneyOut),
				businessIn: round(month.businessIn),
				businessOut: round(month.businessOut),
			}))
			.toSorted((left, right) => left.month.localeCompare(right.month)),
		review,
	}
}

/** Quarter subtotals (Q1 = Jan–Mar), for estimated tax instalments. */
export function quarters(byMonth: MonthLine[]) {
	const out = new Map<
		string,
		Omit<MonthLine, "month"> & { quarter: string }
	>()
	for (const month of byMonth) {
		const quarter = `${month.month.slice(0, 4)} Q${Math.floor((Number(month.month.slice(5, 7)) - 1) / 3) + 1}`
		const line = out.get(quarter) ?? {
			quarter: quarter,
			moneyIn: 0,
			moneyOut: 0,
			businessIn: 0,
			businessOut: 0,
		}
		line.moneyIn = round(line.moneyIn + month.moneyIn)
		line.moneyOut = round(line.moneyOut + month.moneyOut)
		line.businessIn = round(line.businessIn + month.businessIn)
		line.businessOut = round(line.businessOut + month.businessOut)
		out.set(quarter, line)
	}
	return [...out.values()]
}

// ---------------------------------------------------------------- export

type Cell = string | number | null | undefined

const escCsvCell = (cell: Cell) => {
	const raw = cell === null || cell === undefined ? "" : String(cell)
	return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

/** `toCsv` for this feature area. */
export function toCsv(rows: Cell[][]) {
	// A byte-order mark so Excel opens accented names correctly.
	return `﻿${rows.map((row) => row.map(escCsvCell).join(",")).join("\r\n")}\r\n`
}

const isBusinessTx = (transaction: Transaction) =>
	transaction.taxTag === "business" && transaction.category !== "transfers"

const TAG_LABEL = { business: "Business", personal: "Personal" } as const
const formatAmount = (value: number) => value.toFixed(2)

/** `ExportInput` type used in this module. */
export interface ExportInput {
	/** Shown in file names and the readme, e.g. "2025". */
	label: string
	from: string
	to: string
	home: string
	accounts: Account[]
	/** The period's transactions as the bank has them, in each account's own currency. */
	original: Transaction[]
	/** The same transactions restated in `home`, keyed by id. */
	converted: Map<string, Transaction>
	report: TaxReport
	/** Name of the person the report is for, if known. */
	owner?: string
}

/** `transactionsCsv` for this feature area. */
export function transactionsCsv(
	{ original, converted, accounts, home }: ExportInput,
	filter: (transaction: Transaction) => boolean = () => true
) {
	const byId = new Map(accounts.map((account) => [account.id, account]))
	return toCsv([
		[
			"Date",
			"Account",
			"Merchant",
			"Description",
			"Category",
			"Tax tag",
			"Amount",
			"Currency",
			`Amount (${home})`,
			"Note",
			"Pending",
		],
		...original
			.filter(filter)
			.slice()
			.toSorted((left, right) => left.date.localeCompare(right.date))
			.map((transaction) => {
				const account = byId.get(transaction.accountId)
				const homeAmount = converted.get(transaction.id)?.amount
				return [
					transaction.date,
					account?.name,
					transaction.merchant,
					transaction.description,
					CATEGORY_META[transaction.category].label,
					transaction.taxTag ? TAG_LABEL[transaction.taxTag] : "",
					formatAmount(transaction.amount),
					account?.currency,
					homeAmount === undefined ? "" : formatAmount(homeAmount),
					transaction.note,
					transaction.pending ? "yes" : "",
				]
			}),
	])
}

/** `summaryCsv` for this feature area. */
export function summaryCsv({ report, home }: ExportInput) {
	return toCsv([
		[
			"Category",
			"Transactions",
			`Money in (${home})`,
			`Money out (${home})`,
			`Business in (${home})`,
			`Business out (${home})`,
		],
		...report.byCategory.map((line) => [
			CATEGORY_META[line.category].label,
			line.count,
			formatAmount(line.moneyIn),
			formatAmount(line.moneyOut),
			formatAmount(line.businessIn),
			formatAmount(line.businessOut),
		]),
		[],
		["Totals"],
		["Income", "", formatAmount(report.income)],
		["Spending (after refunds)", "", "", formatAmount(report.spending)],
		["Loan & debt payments", "", "", formatAmount(report.debtPayments)],
		["Business income", "", formatAmount(report.businessIn)],
		["Business expenses", "", "", formatAmount(report.businessOut)],
		[
			"Business net",
			"",
			formatAmount(report.businessIn - report.businessOut),
		],
	])
}

/** `monthlyCsv` for this feature area. */
export function monthlyCsv({ report, home }: ExportInput) {
	return toCsv([
		[
			"Period",
			`Money in (${home})`,
			`Money out (${home})`,
			`Net (${home})`,
			`Business in (${home})`,
			`Business out (${home})`,
		],
		...report.byMonth.map((month) => [
			month.month,
			formatAmount(month.moneyIn),
			formatAmount(month.moneyOut),
			formatAmount(month.moneyIn - month.moneyOut),
			formatAmount(month.businessIn),
			formatAmount(month.businessOut),
		]),
		[],
		...quarters(report.byMonth).map((quarter) => [
			quarter.quarter,
			formatAmount(quarter.moneyIn),
			formatAmount(quarter.moneyOut),
			formatAmount(quarter.moneyIn - quarter.moneyOut),
			formatAmount(quarter.businessIn),
			formatAmount(quarter.businessOut),
		]),
	])
}

function readme(input: ExportInput, fmt: (value: number) => string) {
	const { report, label, from, to, accounts, home, owner } = input
	const review = report.review
	const lines = [
		`Tax report: ${label}${owner ? ` for ${owner}` : ""}`,
		`Period: ${from} to ${to}`,
		`Accounts: ${accounts.map((account) => `${account.name}${account.numberMasked ? ` (${account.numberMasked})` : ""}, ${account.currency}`).join("; ") || "none"}`,
		`Totals are in ${home}${accounts.some((account) => account.currency !== home) ? ", converted at current exchange rates" : ""}.`,
		"",
		"Summary",
		`  Income                 ${fmt(report.income)}`,
		`  Spending               ${fmt(report.spending)}`,
		`  Loan & debt payments   ${fmt(report.debtPayments)}`,
		`  Business income        ${fmt(report.businessIn)}`,
		`  Business expenses      ${fmt(report.businessOut)}`,
		`  Business net           ${fmt(report.businessIn - report.businessOut)}`,
		"",
		"Files",
		"  summary.csv            Totals by category, with the business share of each",
		"  monthly.csv            Month-by-month and quarterly totals",
		"  transactions.csv       Every transaction in the period, with category, tax tag and notes",
		"  business-income.csv    Money in tagged as business",
		"  business-expenses.csv  Money out tagged as business",
		"",
		"Notes",
		"  Transfers between the account holder's own accounts are listed in transactions.csv but left out of every total.",
		'  "Spending" is net of refunds. Loan and credit card repayments are counted separately.',
		"  Tax tags (Business / Personal) were set by the account holder. Untagged transactions are treated as personal.",
	]
	const loose = [
		review.uncategorized.length &&
			`${review.uncategorized.length} transaction(s) are still filed under "Other".`,
		review.untaggedIncome.length &&
			`${review.untaggedIncome.length} income deposit(s) aren't tagged business or personal.`,
		review.businessNoNote.length &&
			`${review.businessNoNote.length} business expense(s) have no note.`,
		review.pending.length &&
			`${review.pending.length} transaction(s) were still pending when this was exported.`,
	].filter(Boolean)
	if (loose.length) {
		lines.push("", "Still open", ...loose.map((line) => `  ${line}`))
	}
	lines.push("", `Exported from Ledger on ${isoDate()}.`)
	return lines.join("\r\n") + "\r\n"
}

/** Everything an accountant usually asks for, as one .zip of CSVs plus a readme. */
export function accountantPackage(
	input: ExportInput,
	fmt: (value: number) => string
) {
	const folder = `ledger-tax-${input.label}`
	const files: Record<string, Uint8Array> = {
		[`${folder}/README.txt`]: strToU8(readme(input, fmt)),
		[`${folder}/summary.csv`]: strToU8(summaryCsv(input)),
		[`${folder}/monthly.csv`]: strToU8(monthlyCsv(input)),
		[`${folder}/transactions.csv`]: strToU8(transactionsCsv(input)),
		[`${folder}/business-income.csv`]: strToU8(
			transactionsCsv(
				input,
				(transaction) =>
					isBusinessTx(transaction) && transaction.amount > 0
			)
		),
		[`${folder}/business-expenses.csv`]: strToU8(
			transactionsCsv(
				input,
				(transaction) =>
					isBusinessTx(transaction) && transaction.amount < 0
			)
		),
	}
	return new Blob([zipSync(files) as Uint8Array<ArrayBuffer>], {
		type: "application/zip",
	})
}

/** `downloadBlob` for this feature area. */
export function downloadBlob(filename: string, blob: Blob) {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = filename
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
