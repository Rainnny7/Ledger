/**
 * Reads TD bank account statements (the monthly PDFs EasyWeb offers for download) from their
 * positioned text. EasyWeb's activity page only goes back 18 months; statements go back years.
 *
 * The PDFs draw each word as several glyph runs, so text is regrouped into lines (same y) and
 * words (runs that touch), then each word is placed in a column by its x position under the
 * "Description / Withdrawals / Deposits / Date / Balance" header.
 */
import type { ScrapedTransaction } from '../types.ts'

/** One run of text from a PDF page, positioned in PDF points (y grows upwards). */
export interface TextItem {
  str: string
  x: number
  y: number
  width: number
}

export interface TdStatement {
  /** Branch and account number as printed, e.g. "3203-6506887". */
  accountNumber: string
  /** The "Account Type" box, e.g. "STUDENT". */
  accountType: string
  from: string
  to: string
  openingBalance: number | null
  closingBalance: number | null
  transactions: ScrapedTransaction[]
  /** Set when opening balance + transactions doesn't come to the closing balance. */
  mismatch: number | null
}

interface Word {
  text: string
  x: number
  right: number
}

interface Line {
  y: number
  words: Word[]
  text: string
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const AMOUNT = /^[\d,]+\.\d{2}(OD)?$/
const DAY = /^([A-Z]{3})(\d{1,2})$/
/** Runs closer than this (in points) are parts of one word. */
const WORD_GAP = 1.5

export class NotATdStatement extends Error {}

function toLines(items: TextItem[]): Line[] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: TextItem[][] = []
  for (const item of sorted) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0].y - item.y) <= 2) row.push(item)
    else rows.push([item])
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x)
    const words: Word[] = []
    for (const it of row) {
      const last = words.at(-1)
      if (last && it.x - last.right <= WORD_GAP && !/^\s/.test(it.str)) {
        last.text += it.str
        last.right = Math.max(last.right, it.x + it.width)
      } else {
        words.push({ text: it.str, x: it.x, right: it.x + it.width })
      }
    }
    for (const w of words) w.text = w.text.trim()
    const kept = words.filter((w) => w.text)
    return { y: row[0].y, words: kept, text: kept.map((w) => w.text).join(' ') }
  })
}

const money = (s: string) => {
  const v = Number(s.replace(/,|OD$/g, ''))
  return Math.round((s.endsWith('OD') ? -v : v) * 100) / 100
}

const pad = (n: number) => String(n).padStart(2, '0')

export function parseTdStatement(pages: TextItem[][]): TdStatement {
  const pageLines = pages.map(toLines)
  const all = pageLines.flat()
  const text = all.map((l) => l.text).join('\n')

  const number = text.match(/\b(\d{4}-\d{7})\b/)?.[1]
  const period = text.match(/\b([A-Z]{3})\s*(\d{1,2})\/(\d{2})\s*-\s*([A-Z]{3})\s*(\d{1,2})\/(\d{2})\b/)
  if (!number || !period || !MONTHS.includes(period[1]) || !MONTHS.includes(period[4])) {
    throw new NotATdStatement('Not a TD bank account statement')
  }
  const fromMonth = MONTHS.indexOf(period[1]) + 1
  const fromYear = 2000 + Number(period[3])
  const toMonth = MONTHS.indexOf(period[4]) + 1
  const toYear = 2000 + Number(period[6])
  const from = `${fromYear}-${pad(fromMonth)}-${pad(Number(period[2]))}`
  const to = `${toYear}-${pad(toMonth)}-${pad(Number(period[5]))}`
  // Rows only show "DEC29"; a statement spans at most one new year.
  const dateOf = (mon: string, day: string) => {
    const m = MONTHS.indexOf(mon) + 1
    const y = fromYear === toYear || m >= fromMonth ? fromYear : toYear
    return `${y}-${pad(m)}-${pad(Number(day))}`
  }

  let accountType = ''
  const typeHeader = all.findIndex((l) => /Account Type/.test(l.text) && /Statement From/.test(l.text))
  if (typeHeader >= 0) {
    const words = all[typeHeader].words
    const left = words.find((w, i) => w.text === 'Account' && words[i + 1]?.text === 'Type')?.x ?? 0
    const right = words.find((w) => w.text === 'Statement' && w.x > left)?.x ?? Infinity
    const parts: string[] = []
    for (const line of all.slice(typeHeader + 1, typeHeader + 5)) {
      if (line.text.startsWith('Description')) break
      for (const w of line.words) if (w.x >= left - 20 && w.right < right && !/\d/.test(w.text)) parts.push(w.text)
    }
    accountType = parts.join(' ')
  }

  let openingBalance: number | null = null
  let closingBalance: number | null = null
  const transactions: ScrapedTransaction[] = []
  let foundTable = false

  for (const lines of pageLines) {
    const headerAt = lines.findIndex((l) => /^Description Withdrawals Deposits Date Balance$/.test(l.text))
    if (headerAt < 0) continue
    foundTable = true
    const col = (name: string) => lines[headerAt].words.find((w) => w.text === name)!
    const withdrawals = col('Withdrawals')
    const deposits = col('Deposits')
    const date = col('Date')
    const balance = col('Balance')

    for (const line of lines.slice(headerAt + 1)) {
      let day: string | null = null
      let out: number | null = null
      let inn: number | null = null
      let bal: number | null = null
      const desc: string[] = []
      for (const w of line.words) {
        const d = w.text.match(DAY)
        if (d && MONTHS.includes(d[1]) && w.x >= date.x - 20 && w.x < balance.x) day = dateOf(d[1], d[2])
        else if (AMOUNT.test(w.text) && w.x > date.right) bal = money(w.text)
        else if (AMOUNT.test(w.text) && w.right > deposits.x) inn = money(w.text)
        else if (AMOUNT.test(w.text) && w.right > withdrawals.x - 40) out = money(w.text)
        else if (w.right < withdrawals.x) desc.push(w.text)
      }
      // The totals row (amounts, no description) ends the table.
      if (!day && !desc.length && (out !== null || inn !== null)) break
      if (!day) continue
      const description = desc.join(' ')
      if (/^STARTING BALANCE$/.test(description)) openingBalance = bal
      else if (/^CLOSING BALANCE$/.test(description)) closingBalance = bal
      else if (description && (out !== null || inn !== null)) {
        transactions.push({
          date: day,
          description,
          amount: inn !== null ? inn : -(out as number),
          runningBalance: bal,
          pending: false,
        })
      }
    }
  }
  if (!foundTable) throw new NotATdStatement('No transaction table found (only TD chequing and savings statements are supported)')

  // Older statements have no CLOSING BALANCE row; the last day's balance is the same thing.
  closingBalance ??= transactions.findLast((t) => t.runningBalance !== null)?.runningBalance ?? null

  // Every printed balance (one per day) has to follow from the rows above it.
  let mismatch: number | null = null
  if (openingBalance !== null) {
    let running = openingBalance
    const off = (printed: number) => Math.round((printed - running) * 100) / 100
    for (const t of transactions) {
      running += t.amount
      if (t.runningBalance !== null && off(t.runningBalance) !== 0) {
        mismatch = off(t.runningBalance)
        break
      }
    }
    if (mismatch === null && closingBalance !== null && off(closingBalance) !== 0) mismatch = off(closingBalance)
  }
  return { accountNumber: number, accountType, from, to, openingBalance, closingBalance, transactions, mismatch }
}
