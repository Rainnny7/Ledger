/**
 * Reads TD bank account statements (the monthly PDFs EasyWeb offers for download) from their
 * positioned text. EasyWeb's activity page only goes back 18 months; statements go back years.
 *
 * The PDFs draw each word as several glyph runs, so text is regrouped into lines (same y) and
 * words (runs that touch), then each word is placed in a column by its x position under the
 * "Description / Withdrawals / Deposits / Date / Balance" header.
 */
import { fromCents, roundMoney, toCents } from "@ledger/shared/money"
import type { ScrapedTransaction } from "../types.ts"

/** One run of text from a PDF page, positioned in PDF points (y grows upwards). */
export interface TextItem {
	str: string
	x: number
	y: number
	width: number
}

/** Shape of TdStatement as stored and returned by the API. */
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

const MONTHS = [
	"JAN",
	"FEB",
	"MAR",
	"APR",
	"MAY",
	"JUN",
	"JUL",
	"AUG",
	"SEP",
	"OCT",
	"NOV",
	"DEC",
]
const AMOUNT = /^[\d,]+\.\d{2}(OD)?$/
const DAY = /^([A-Z]{3})(\d{1,2})$/
/** Runs closer than this (in points) are parts of one word. */
const WORD_GAP = 1.5

/** NotATdStatement bank client implementation. */
export class NotATdStatement extends Error {}

function toLines(items: TextItem[]): Line[] {
	const sorted = items
		.filter((i) => i.str.trim())
		.toSorted((left, right) => right.y - left.y || left.x - right.x)
	const rows: TextItem[][] = []
	for (const item of sorted) {
		const row = rows.at(-1)
		if (row && Math.abs(row[0].y - item.y) <= 2) {
			row.push(item)
		} else {
			rows.push([item])
		}
	}
	return rows.map((row) => {
		const ordered = row.toSorted((left, right) => left.x - right.x)
		const words: Word[] = []
		for (const item of ordered) {
			const last = words.at(-1)
			if (
				last &&
				item.x - last.right <= WORD_GAP &&
				!/^\s/.test(item.str)
			) {
				last.text += item.str
				last.right = Math.max(last.right, item.x + item.width)
			} else {
				words.push({
					text: item.str,
					x: item.x,
					right: item.x + item.width,
				})
			}
		}
		for (const word of words) {
			word.text = word.text.trim()
		}
		const kept = words.filter((word) => word.text)
		return {
			y: row[0].y,
			words: kept,
			text: kept.map((word) => word.text).join(" "),
		}
	})
}

const money = (text: string) => {
	const value = Number(text.replace(/,|OD$/g, ""))
	return roundMoney(text.endsWith("OD") ? -value : value)
}

const pad = (value: number) => String(value).padStart(2, "0")

/** Parse TD PDF text items into balances and transactions. */
export function parseTdStatement(pages: TextItem[][]): TdStatement {
	const pageLines = pages.map(toLines)
	const all = pageLines.flat()
	const text = all.map((line) => line.text).join("\n")

	const number = text.match(/\b(\d{4}-\d{7})\b/)?.[1]
	const period = text.match(
		/\b([A-Z]{3})\s*(\d{1,2})\/(\d{2})\s*-\s*([A-Z]{3})\s*(\d{1,2})\/(\d{2})\b/
	)
	if (
		!number ||
		!period ||
		!MONTHS.includes(period[1]) ||
		!MONTHS.includes(period[4])
	) {
		throw new NotATdStatement("Not a TD bank account statement")
	}
	const fromMonth = MONTHS.indexOf(period[1]) + 1
	const fromYear = 2000 + Number(period[3])
	const toMonth = MONTHS.indexOf(period[4]) + 1
	const toYear = 2000 + Number(period[6])
	const from = `${fromYear}-${pad(fromMonth)}-${pad(Number(period[2]))}`
	const to = `${toYear}-${pad(toMonth)}-${pad(Number(period[5]))}`
	// Rows only show "DEC29"; a statement spans at most one new year.
	const dateOf = (mon: string, day: string) => {
		const monthIndex = MONTHS.indexOf(mon) + 1
		const year =
			fromYear === toYear || monthIndex >= fromMonth ? fromYear : toYear
		return `${year}-${pad(monthIndex)}-${pad(Number(day))}`
	}

	let accountType = ""
	const typeHeader = all.findIndex(
		(line) =>
			/Account Type/.test(line.text) && /Statement From/.test(line.text)
	)
	if (typeHeader >= 0) {
		const words = all[typeHeader].words
		const left =
			words.find(
				(word, i) =>
					word.text === "Account" && words[i + 1]?.text === "Type"
			)?.x ?? 0
		const right =
			words.find((word) => word.text === "Statement" && word.x > left)
				?.x ?? Infinity
		const parts: string[] = []
		for (const line of all.slice(typeHeader + 1, typeHeader + 5)) {
			if (line.text.startsWith("Description")) {
				break
			}
			for (const word of line.words) {
				if (
					word.x >= left - 20 &&
					word.right < right &&
					!/\d/.test(word.text)
				) {
					parts.push(word.text)
				}
			}
		}
		accountType = parts.join(" ")
	}

	let openingBalance: number | null = null
	let closingBalance: number | null = null
	const transactions: ScrapedTransaction[] = []
	let foundTable = false

	for (const lines of pageLines) {
		const headerAt = lines.findIndex((line) =>
			/^Description Withdrawals Deposits Date Balance$/.test(line.text)
		)
		if (headerAt < 0) {
			continue
		}
		foundTable = true
		const col = (name: string) =>
			lines[headerAt].words.find((word) => word.text === name)!
		const withdrawals = col("Withdrawals")
		const deposits = col("Deposits")
		const date = col("Date")
		const balance = col("Balance")

		for (const line of lines.slice(headerAt + 1)) {
			let day: string | null = null
			let out: number | null = null
			let inn: number | null = null
			let bal: number | null = null
			const desc: string[] = []
			for (const word of line.words) {
				const dayMatch = word.text.match(DAY)
				if (
					dayMatch &&
					MONTHS.includes(dayMatch[1]) &&
					word.x >= date.x - 20 &&
					word.x < balance.x
				) {
					day = dateOf(dayMatch[1], dayMatch[2])
				} else if (AMOUNT.test(word.text) && word.x > date.right) {
					bal = money(word.text)
				} else if (AMOUNT.test(word.text) && word.right > deposits.x) {
					inn = money(word.text)
				} else if (
					AMOUNT.test(word.text) &&
					word.right > withdrawals.x - 40
				) {
					out = money(word.text)
				} else if (word.right < withdrawals.x) {
					desc.push(word.text)
				}
			}
			// The totals row (amounts, no description) ends the table.
			if (!day && !desc.length && (out !== null || inn !== null)) {
				break
			}
			if (!day) {
				continue
			}
			const description = desc.join(" ")
			if (/^STARTING BALANCE$/.test(description)) {
				openingBalance = bal
			} else if (/^CLOSING BALANCE$/.test(description)) {
				closingBalance = bal
			} else if (description && (out !== null || inn !== null)) {
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
	if (!foundTable) {
		throw new NotATdStatement(
			"No transaction table found (only TD chequing and savings statements are supported)"
		)
	}

	// Older statements have no CLOSING BALANCE row; the last day's balance is the same thing.
	closingBalance ??=
		transactions.findLast(
			(transaction) => transaction.runningBalance !== null
		)?.runningBalance ?? null

	// Every printed balance (one per day) has to follow from the rows above it.
	let mismatch: number | null = null
	if (openingBalance !== null) {
		let running = toCents(openingBalance)
		const off = (printed: number) => toCents(printed) - running
		for (const transaction of transactions) {
			running += toCents(transaction.amount)
			if (
				transaction.runningBalance !== null &&
				off(transaction.runningBalance) !== 0
			) {
				mismatch = fromCents(off(transaction.runningBalance))
				break
			}
		}
		if (
			mismatch === null &&
			closingBalance !== null &&
			off(closingBalance) !== 0
		) {
			mismatch = fromCents(off(closingBalance))
		}
	}
	return {
		accountNumber: number,
		accountType,
		from,
		to,
		openingBalance,
		closingBalance,
		transactions,
		mismatch,
	}
}
