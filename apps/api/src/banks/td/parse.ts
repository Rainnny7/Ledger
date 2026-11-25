/**
 * Pure parsing helpers that turn raw text/table data scraped from EasyWeb
 * into structured accounts & transactions. Kept free of Playwright so they can
 * be unit-tested with fixtures.
 */
import { roundMoney } from "@ledger/shared/money"
import type { AccountType, ScrapedTransaction } from "../types.ts"

/** Shape of RawTable as stored and returned by the API. */
export interface RawTable {
	index: number
	headers: string[]
	rows: { cells: string[]; link: string | null }[]
	context: string
}

/** Shape of RawFrame as stored and returned by the API. */
export interface RawFrame {
	url: string
	title: string
	text: string
	tables: RawTable[]
}

const MONTHS: Record<string, number> = {
	jan: 1,
	feb: 2,
	mar: 3,
	apr: 4,
	may: 5,
	jun: 6,
	jul: 7,
	aug: 8,
	sep: 9,
	sept: 9,
	oct: 10,
	nov: 11,
	dec: 12,
}

const AMOUNT_RE =
	/(?:\(\s*)?-?\s*(?:CAD|USD|C?\$|US\$)?\s*-?\s*\$?\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:CR|DR|-)?(?:\s*\))?/i

/** Parse a money string such as "$1,234.56", "-$12.00", "$12.00-", "(12.00)", "45.00 CR". */
export function parseAmount(raw: string | null | undefined): number | null {
	if (!raw) {
		return null
	}
	const normalizedText = raw.replace(/−/g, "-").replace(/\s+/g, " ").trim()
	if (!/\d/.test(normalizedText)) {
		return null
	}
	const amountMatch = normalizedText.match(/\d[\d,]*(?:\.\d{1,2})?/)
	if (!amountMatch) {
		return null
	}
	let value = Number(amountMatch[0].replace(/,/g, ""))
	if (Number.isNaN(value)) {
		return null
	}
	const negative =
		/^\s*\(.*\)\s*$/.test(normalizedText) ||
		/-\s*(?:CAD|USD|US\$|C?\$)?\s*\d/i.test(normalizedText) ||
		/\d\s*-\s*$/.test(normalizedText) ||
		/\bDR\b/i.test(normalizedText) ||
		/\bminus\b/i.test(normalizedText)
	if (negative) {
		value = -value
	}
	return roundMoney(value)
}

/** True when the cell looks like it is a money amount (and not, say, a date or account number). */
export function looksLikeAmount(raw: string): boolean {
	const trimmedText = raw.trim()
	if (!trimmedText || trimmedText.length > 40) {
		return false
	}
	if (!/\$|\d\.\d{2}\b/.test(trimmedText)) {
		return false
	}
	const amountMatch = trimmedText.match(AMOUNT_RE)
	return !!amountMatch && amountMatch[0].replace(/[^\d]/g, "").length > 0
}

const pad = (value: number) => String(value).padStart(2, "0")

/** Parse TD date formats: "Nov 21, 2026", "Nov 21", "21 Nov 2026", "2026-11-21", "11/21/2026". */
export function parseDate(
	raw: string | null | undefined,
	today = new Date()
): string | null {
	if (!raw) {
		return null
	}
	const normalizedText = raw.replace(/\s+/g, " ").trim()

	let dateMatch = normalizedText.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
	if (dateMatch) {
		return `${dateMatch[1]}-${pad(+dateMatch[2])}-${pad(+dateMatch[3])}`
	}

	dateMatch = normalizedText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
	if (dateMatch) {
		return `${dateMatch[3]}-${pad(+dateMatch[1])}-${pad(+dateMatch[2])}`
	}

	let month: number | undefined
	let day: number | undefined
	let year: number | undefined

	dateMatch = normalizedText.match(
		/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?\b/
	)
	if (dateMatch && MONTHS[dateMatch[1].slice(0, 3).toLowerCase()]) {
		month = MONTHS[dateMatch[1].slice(0, 3).toLowerCase()]
		day = +dateMatch[2]
		year = dateMatch[3] ? +dateMatch[3] : undefined
	} else {
		dateMatch = normalizedText.match(
			/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?(?:\s+(\d{4}))?\b/
		)
		if (dateMatch && MONTHS[dateMatch[2].slice(0, 3).toLowerCase()]) {
			month = MONTHS[dateMatch[2].slice(0, 3).toLowerCase()]
			day = +dateMatch[1]
			year = dateMatch[3] ? +dateMatch[3] : undefined
		}
	}
	if (!month || !day || day > 31) {
		return null
	}

	if (!year) {
		// No year shown: assume the most recent occurrence of that date.
		year = today.getFullYear()
		const candidate = new Date(year, month - 1, day)
		if (candidate.getTime() - today.getTime() > 2 * 86_400_000) {
			year -= 1
		}
	}
	return `${year}-${pad(month)}-${pad(day)}`
}

/** Infer checking/savings/credit from TD account labels. */
export function guessAccountType(name: string, context = ""): AccountType {
	const labelText = `${name} ${context}`
	if (
		/visa|mastercard|master card|credit card|aeroplan|cash ?back|rewards|first class travel|platinum|infinite/i.test(
			labelText
		)
	) {
		return "credit"
	}
	if (/line of credit|\bloc\b|loan|mortgage|borrowing/i.test(labelText)) {
		return "loan"
	}
	if (
		/tfsa|rrsp|resp|rrif|invest|direct investing|webbroker|gic\b|mutual fund/i.test(
			labelText
		)
	) {
		return "investment"
	}
	if (/saving|e-?savings|high interest/i.test(labelText)) {
		return "savings"
	}
	if (
		/chequing|checking|cheq|every ?day|all-inclusive|unlimited|minimum|student|\bbank\w*/i.test(
			labelText
		)
	) {
		return "chequing"
	}
	return "other"
}

/** Pull a masked account number from TD summary text. */
export function extractMaskedNumber(...parts: string[]): string | null {
	for (const part of parts) {
		// A run of digits possibly broken up by spaces, dashes or mask characters, ending in a digit.
		for (const maskMatch of part.matchAll(/[\d*•xX](?:[\d*•xX\s-]*\d)?/g)) {
			const digits = maskMatch[0].replace(/\D/g, "")
			if (
				digits.length >= 4 &&
				!/[$.,]/.test(maskMatch[0]) &&
				/\d{4}/.test(maskMatch[0])
			) {
				return `••••${digits.slice(-4)}`
			}
		}
	}
	return null
}

/** Shape of SummaryAccount as stored and returned by the API. */
export interface SummaryAccount {
	name: string
	linkText: string
	linkOccurrence: number
	frameIndex: number
	type: AccountType
	numberMasked: string | null
	externalKey: string
	balance: number | null
	available: number | null
}

function findCol(headers: string[], re: RegExp, exclude?: RegExp): number {
	return headers.findIndex(
		(header) => re.test(header) && !(exclude && exclude.test(header))
	)
}

/** Find account rows (a link + at least one money amount) across all frames of the summary page. */
export function parseAccountSummary(frames: RawFrame[]): SummaryAccount[] {
	const accounts: SummaryAccount[] = []
	const seen = new Set<string>()

	frames.forEach((frame, frameIndex) => {
		const linkCounts = new Map<string, number>()
		for (const table of frame.tables) {
			const balCol = findCol(table.headers, /balance|amount owing|owing/i)
			const availCol = findCol(table.headers, /available/i)
			for (const row of table.rows) {
				if (!row.link) {
					continue
				}
				const occurrence = linkCounts.get(row.link) ?? 0
				linkCounts.set(row.link, occurrence + 1)

				const amountIdx = row.cells
					.map((cell, i) => (looksLikeAmount(cell) ? i : -1))
					.filter((i) => i >= 0)
				if (amountIdx.length === 0) {
					continue
				}

				// Header columns are aligned with cells when counts match; otherwise fall back to position.
				const aligned = table.headers.length === row.cells.length
				const balance = parseAmount(
					aligned && balCol >= 0
						? row.cells[balCol]
						: row.cells[amountIdx[0]]
				)
				const available = parseAmount(
					aligned && availCol >= 0
						? row.cells[availCol]
						: amountIdx.length > 1
							? row.cells[amountIdx[1]]
							: null
				)

				const name = row.link.replace(/\s+/g, " ").trim()
				const numberMasked = extractMaskedNumber(row.link, ...row.cells)
				const externalKey = `${name
					.replace(/[\d\s*•xX-]+$/, "")
					.trim()
					.toLowerCase()}|${numberMasked ?? ""}`
				if (seen.has(externalKey)) {
					continue
				}
				seen.add(externalKey)

				accounts.push({
					name:
						name.replace(/\s*[*•xX]*\d[\d\s-]{3,}$/, "").trim() ||
						name,
					linkText: row.link,
					linkOccurrence: occurrence,
					frameIndex,
					type: guessAccountType(
						name,
						`${table.context} ${row.cells.join(" ")}`
					),
					numberMasked,
					externalKey,
					balance,
					available,
				})
			}
		}
	})
	return accounts
}

/** Pull labelled money values (e.g. "Overdraft protection limit $500.00") out of page text. */
export function findLabelledAmount(text: string, label: RegExp): number | null {
	const lines = text
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean)
	for (let i = 0; i < lines.length; i++) {
		if (!label.test(lines[i])) {
			continue
		}
		const rest = lines[i].replace(label, "")
		if (looksLikeAmount(rest)) {
			return parseAmount(
				rest.match(/[-($]*\$?\s*\d[\d,]*(?:\.\d{2})?\)?-?/)?.[0]
			)
		}
		for (const next of lines.slice(i + 1, i + 3)) {
			if (looksLikeAmount(next)) {
				return parseAmount(next)
			}
		}
	}
	return null
}

/** Find transaction tables in an account-detail page and normalise their rows. */
export function parseTransactions(
	frames: RawFrame[],
	accountType: AccountType,
	today = new Date()
): ScrapedTransaction[] {
	const out: ScrapedTransaction[] = []
	for (const frame of frames) {
		for (const table of frame.tables) {
			const headers = table.headers
			const dateCol = (() => {
				const transactionDateColumn = findCol(
					headers,
					/transaction date/i
				)
				return transactionDateColumn >= 0
					? transactionDateColumn
					: findCol(headers, /date/i)
			})()
			if (dateCol < 0) {
				continue
			}
			const descCol = findCol(
				headers,
				/descr|details|merchant|transaction|payee/i,
				/date|amount/i
			)
			if (descCol < 0) {
				continue
			}
			const debitCol = findCol(
				headers,
				/debit|withdraw|money out|purchase|charges/i
			)
			const creditCol = findCol(
				headers,
				/credit|deposit|money in|payment/i,
				/credit limit/i
			)
			const amountCol = findCol(headers, /amount/i)
			const balanceCol = findCol(headers, /balance/i)
			if (debitCol < 0 && creditCol < 0 && amountCol < 0) {
				continue
			}

			const pending = /pending|authori[sz]/i.test(table.context)

			for (const row of table.rows) {
				if (row.cells.length < Math.max(dateCol, descCol) + 1) {
					continue
				}
				const date = parseDate(row.cells[dateCol], today)
				if (!date) {
					continue
				}
				const description = row.cells[descCol]
					.replace(/\s+/g, " ")
					.trim()
				if (!description) {
					continue
				}

				let amount: number | null = null
				if (debitCol >= 0 || creditCol >= 0) {
					const debit =
						debitCol >= 0 ? parseAmount(row.cells[debitCol]) : null
					const credit =
						creditCol >= 0
							? parseAmount(row.cells[creditCol])
							: null
					if (debit) {
						amount = -Math.abs(debit)
					} else if (credit) {
						amount = Math.abs(credit)
					}
				}
				if (amount === null && amountCol >= 0) {
					amount = parseAmount(row.cells[amountCol])
					// Credit card statements list purchases as positive amounts.
					if (amount !== null && accountType === "credit") {
						amount = -amount
					}
				}
				if (amount === null) {
					continue
				}

				out.push({
					date,
					description,
					amount,
					runningBalance:
						balanceCol >= 0
							? parseAmount(row.cells[balanceCol])
							: null,
					pending: pending || /pending/i.test(row.cells.join(" ")),
				})
			}
		}
	}
	return out
}

/** Shape of AccountLimit as stored and returned by the API. */
export interface AccountLimit {
	label: string
	amount: number | null
	/** Raw value text when it isn't a plain amount (e.g. "Unlimited"). */
	text: string | null
}

/** Shape of AccountDetails as stored and returned by the API. */
export interface AccountDetails {
	/** Full account number (TD shows it in the page header, e.g. "CHEQUING ACCOUNT / 1234567"). */
	accountNumber: string | null
	transit: string | null
	institution: string | null
	limits: AccountLimit[]
}

const LIMIT_SKIP =
	/overdraft|credit limit|limited time|limitation|unlimited transactions/i

/**
 * Best-effort read of direct-deposit details and limits from an account's Activity/Manage pages.
 * Labels and values often sit on separate lines, so each label also looks at the next two lines.
 */
export function parseAccountDetails(
	text: string,
	institutionDefault = "004"
): AccountDetails {
	const lines = text
		.split(/\n+/)
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
	const flat = lines.join(" \n ")

	const valueAfter = (label: RegExp, value: RegExp): string | null => {
		for (let i = 0; i < lines.length; i++) {
			if (!label.test(lines[i])) {
				continue
			}
			for (const cand of [
				lines[i].replace(label, ""),
				...lines.slice(i + 1, i + 3),
			]) {
				const candidateMatch = cand.match(value)
				if (candidateMatch) {
					return candidateMatch[1] ?? candidateMatch[0]
				}
			}
		}
		return null
	}

	const accountNumber =
		flat.match(/currently viewing[^\n]*?\/\s*(\d{5,12})\b/i)?.[1] ??
		valueAfter(/account (number|no\.?|#)/i, /^\D{0,3}(\d{5,12})\b/) ??
		null
	const transit = valueAfter(
		/transit( number| no\.?| #)?/i,
		/^\D{0,3}(\d{5})\b/
	)
	const institution =
		valueAfter(/institution( number| no\.?| #)?/i, /^\D{0,3}(\d{3})\b/) ??
		(transit ? institutionDefault : null)

	const limits: AccountLimit[] = []
	const seen = new Set<string>()
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		if (
			!/\blimits?\b/i.test(line) ||
			LIMIT_SKIP.test(line) ||
			line.length > 80
		) {
			continue
		}
		const sameLine = line.match(
			/^(.*?\blimits?\b[^$\d]*?)[:\s]*(\$\s?\d[\d,]*(?:\.\d{2})?)\s*$/i
		)
		let label = line
		let raw: string | null = null
		if (sameLine) {
			label = sameLine[1]
			raw = sameLine[2]
		} else {
			raw =
				lines
					.slice(i + 1, i + 3)
					.find(
						(lineText) =>
							looksLikeAmount(lineText) ||
							/^(unlimited|no limit)$/i.test(lineText)
					) ?? null
		}
		if (!raw) {
			continue
		}
		label = label.replace(/[:\s]+$/, "").trim()
		if (!label || seen.has(label.toLowerCase())) {
			continue
		}
		seen.add(label.toLowerCase())
		const amount = looksLikeAmount(raw) ? parseAmount(raw) : null
		limits.push({ label, amount, text: amount === null ? raw : null })
	}
	return { accountNumber, transit, institution, limits }
}
