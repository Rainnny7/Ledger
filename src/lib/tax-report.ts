import { strToU8, zipSync } from 'fflate'
import type { Account, Category, Transaction } from './api'
import { CATEGORY_LIST, CATEGORY_META, NON_SPEND } from './categories'

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

export interface MonthLine {
  /** YYYY-MM */
  month: string
  moneyIn: number
  moneyOut: number
  businessIn: number
  businessOut: number
}

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

const round = (v: number) => Math.round(v * 100) / 100

/** Calendar years that have transactions, newest first (always includes the current year). */
export function reportYears(transactions: Transaction[], today = new Date()) {
  const years = new Set([today.getFullYear()])
  for (const t of transactions) years.add(Number(t.date.slice(0, 4)))
  return [...years].filter(Number.isFinite).sort((a, b) => b - a)
}

/** Most people file in spring for the year before; later in the year, the current one is more useful. */
export function defaultReportYear(years: number[], today = new Date()) {
  const current = today.getFullYear()
  const preferred = today.getMonth() < 5 ? current - 1 : current
  return years.includes(preferred) ? preferred : current
}

export function inPeriod(t: Transaction, from: string, to: string) {
  return t.date >= from && t.date <= to
}

export function buildTaxReport(transactions: Transaction[]): TaxReport {
  const cats = new Map<Category, CategoryLine>()
  const months = new Map<string, MonthLine>()
  const review: TaxReport['review'] = { uncategorized: [], untaggedIncome: [], businessNoNote: [], pending: [] }
  let income = 0
  let spending = 0
  let debtPayments = 0
  let businessIn = 0
  let businessOut = 0
  let personalOut = 0
  let count = 0

  for (const t of transactions) {
    if (t.pending) review.pending.push(t)
    if (t.category === 'transfers') continue
    count++
    const business = t.taxTag === 'business'
    const moneyIn = t.amount > 0 ? t.amount : 0
    const moneyOut = t.amount < 0 ? -t.amount : 0

    const line = cats.get(t.category) ?? { category: t.category, count: 0, moneyIn: 0, moneyOut: 0, businessIn: 0, businessOut: 0 }
    line.count++
    line.moneyIn += moneyIn
    line.moneyOut += moneyOut
    if (business) {
      line.businessIn += moneyIn
      line.businessOut += moneyOut
    }
    cats.set(t.category, line)

    const key = t.date.slice(0, 7)
    const month = months.get(key) ?? { month: key, moneyIn: 0, moneyOut: 0, businessIn: 0, businessOut: 0 }
    month.moneyIn += moneyIn
    month.moneyOut += moneyOut
    if (business) {
      month.businessIn += moneyIn
      month.businessOut += moneyOut
    }
    months.set(key, month)

    if (t.category === 'income') income += t.amount
    else if (t.category === 'debt') debtPayments -= t.amount
    else if (!NON_SPEND.has(t.category)) spending -= t.amount

    if (business) {
      businessIn += moneyIn
      businessOut += moneyOut
    } else if (t.category !== 'income' && t.category !== 'debt') personalOut -= t.amount

    if (t.category === 'other') review.uncategorized.push(t)
    if (t.amount > 0 && t.category === 'income' && !t.taxTag) review.untaggedIncome.push(t)
    if (business && t.amount < 0 && !t.note?.trim()) review.businessNoNote.push(t)
  }

  const order = new Map(CATEGORY_LIST.map((c, i) => [c, i]))
  return {
    income: round(income),
    spending: round(spending),
    debtPayments: round(debtPayments),
    businessIn: round(businessIn),
    businessOut: round(businessOut),
    personalOut: round(Math.max(0, personalOut)),
    count,
    byCategory: [...cats.values()]
      .map((l) => ({ ...l, moneyIn: round(l.moneyIn), moneyOut: round(l.moneyOut), businessIn: round(l.businessIn), businessOut: round(l.businessOut) }))
      .sort((a, b) => b.moneyOut + b.moneyIn - (a.moneyOut + a.moneyIn) || order.get(a.category)! - order.get(b.category)!),
    byMonth: [...months.values()]
      .map((m) => ({ ...m, moneyIn: round(m.moneyIn), moneyOut: round(m.moneyOut), businessIn: round(m.businessIn), businessOut: round(m.businessOut) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    review,
  }
}

/** Quarter subtotals (Q1 = Jan–Mar), for estimated tax instalments. */
export function quarters(byMonth: MonthLine[]) {
  const out = new Map<string, Omit<MonthLine, 'month'> & { quarter: string }>()
  for (const m of byMonth) {
    const q = `${m.month.slice(0, 4)} Q${Math.floor((Number(m.month.slice(5, 7)) - 1) / 3) + 1}`
    const line = out.get(q) ?? { quarter: q, moneyIn: 0, moneyOut: 0, businessIn: 0, businessOut: 0 }
    line.moneyIn = round(line.moneyIn + m.moneyIn)
    line.moneyOut = round(line.moneyOut + m.moneyOut)
    line.businessIn = round(line.businessIn + m.businessIn)
    line.businessOut = round(line.businessOut + m.businessOut)
    out.set(q, line)
  }
  return [...out.values()]
}

// ---------------------------------------------------------------- export

type Cell = string | number | null | undefined

export function toCsv(rows: Cell[][]) {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // A byte-order mark so Excel opens accented names correctly.
  return `﻿${rows.map((r) => r.map(esc).join(',')).join('\r\n')}\r\n`
}

const TAG_LABEL = { business: 'Business', personal: 'Personal' } as const
const money = (v: number) => v.toFixed(2)

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

export function transactionsCsv({ original, converted, accounts, home }: ExportInput, filter: (t: Transaction) => boolean = () => true) {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  return toCsv([
    ['Date', 'Account', 'Merchant', 'Description', 'Category', 'Tax tag', 'Amount', 'Currency', `Amount (${home})`, 'Note', 'Pending'],
    ...original
      .filter(filter)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => {
        const account = byId.get(t.accountId)
        const homeAmount = converted.get(t.id)?.amount
        return [
          t.date,
          account?.name,
          t.merchant,
          t.description,
          CATEGORY_META[t.category].label,
          t.taxTag ? TAG_LABEL[t.taxTag] : '',
          money(t.amount),
          account?.currency,
          homeAmount === undefined ? '' : money(homeAmount),
          t.note,
          t.pending ? 'yes' : '',
        ]
      }),
  ])
}

export function summaryCsv({ report, home }: ExportInput) {
  return toCsv([
    ['Category', 'Transactions', `Money in (${home})`, `Money out (${home})`, `Business in (${home})`, `Business out (${home})`],
    ...report.byCategory.map((l) => [
      CATEGORY_META[l.category].label,
      l.count,
      money(l.moneyIn),
      money(l.moneyOut),
      money(l.businessIn),
      money(l.businessOut),
    ]),
    [],
    ['Totals'],
    ['Income', '', money(report.income)],
    ['Spending (after refunds)', '', '', money(report.spending)],
    ['Loan & debt payments', '', '', money(report.debtPayments)],
    ['Business income', '', money(report.businessIn)],
    ['Business expenses', '', '', money(report.businessOut)],
    ['Business net', '', money(report.businessIn - report.businessOut)],
  ])
}

export function monthlyCsv({ report, home }: ExportInput) {
  return toCsv([
    ['Period', `Money in (${home})`, `Money out (${home})`, `Net (${home})`, `Business in (${home})`, `Business out (${home})`],
    ...report.byMonth.map((m) => [m.month, money(m.moneyIn), money(m.moneyOut), money(m.moneyIn - m.moneyOut), money(m.businessIn), money(m.businessOut)]),
    [],
    ...quarters(report.byMonth).map((q) => [q.quarter, money(q.moneyIn), money(q.moneyOut), money(q.moneyIn - q.moneyOut), money(q.businessIn), money(q.businessOut)]),
  ])
}

function readme(input: ExportInput, fmt: (v: number) => string) {
  const { report, label, from, to, accounts, home, owner } = input
  const r = report.review
  const lines = [
    `Tax report: ${label}${owner ? ` for ${owner}` : ''}`,
    `Period: ${from} to ${to}`,
    `Accounts: ${accounts.map((a) => `${a.name}${a.numberMasked ? ` (${a.numberMasked})` : ''}, ${a.currency}`).join('; ') || 'none'}`,
    `Totals are in ${home}${accounts.some((a) => a.currency !== home) ? ', converted at current exchange rates' : ''}.`,
    '',
    'Summary',
    `  Income                 ${fmt(report.income)}`,
    `  Spending               ${fmt(report.spending)}`,
    `  Loan & debt payments   ${fmt(report.debtPayments)}`,
    `  Business income        ${fmt(report.businessIn)}`,
    `  Business expenses      ${fmt(report.businessOut)}`,
    `  Business net           ${fmt(report.businessIn - report.businessOut)}`,
    '',
    'Files',
    '  summary.csv            Totals by category, with the business share of each',
    '  monthly.csv            Month-by-month and quarterly totals',
    '  transactions.csv       Every transaction in the period, with category, tax tag and notes',
    '  business-income.csv    Money in tagged as business',
    '  business-expenses.csv  Money out tagged as business',
    '',
    'Notes',
    '  Transfers between the account holder\'s own accounts are listed in transactions.csv but left out of every total.',
    '  "Spending" is net of refunds. Loan and credit card repayments are counted separately.',
    '  Tax tags (Business / Personal) were set by the account holder. Untagged transactions are treated as personal.',
  ]
  const loose = [
    r.uncategorized.length && `${r.uncategorized.length} transaction(s) are still filed under "Other".`,
    r.untaggedIncome.length && `${r.untaggedIncome.length} income deposit(s) aren't tagged business or personal.`,
    r.businessNoNote.length && `${r.businessNoNote.length} business expense(s) have no note.`,
    r.pending.length && `${r.pending.length} transaction(s) were still pending when this was exported.`,
  ].filter(Boolean)
  if (loose.length) lines.push('', 'Still open', ...loose.map((l) => `  ${l}`))
  lines.push('', `Exported from Ledger on ${new Date().toISOString().slice(0, 10)}.`)
  return lines.join('\r\n') + '\r\n'
}

/** Everything an accountant usually asks for, as one .zip of CSVs plus a readme. */
export function accountantPackage(input: ExportInput, fmt: (v: number) => string) {
  const isBusiness = (t: Transaction) => t.taxTag === 'business' && t.category !== 'transfers'
  const folder = `ledger-tax-${input.label}`
  const files: Record<string, Uint8Array> = {
    [`${folder}/README.txt`]: strToU8(readme(input, fmt)),
    [`${folder}/summary.csv`]: strToU8(summaryCsv(input)),
    [`${folder}/monthly.csv`]: strToU8(monthlyCsv(input)),
    [`${folder}/transactions.csv`]: strToU8(transactionsCsv(input)),
    [`${folder}/business-income.csv`]: strToU8(transactionsCsv(input, (t) => isBusiness(t) && t.amount > 0)),
    [`${folder}/business-expenses.csv`]: strToU8(transactionsCsv(input, (t) => isBusiness(t) && t.amount < 0)),
  }
  return new Blob([zipSync(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
