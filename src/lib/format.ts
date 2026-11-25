import type { AccountType } from "./api"

const money = new Map<string, Intl.NumberFormat>()

/**
 * The currency used when a figure doesn't name one: totals, which pages convert into the person's
 * home currency. The app shell sets it from the account's preference before pages render.
 */
let displayCurrency = "CAD"
/** Currency used when a figure does not name one (set from account settings). */
export const getDisplayCurrency = () => displayCurrency
/** Sets the display currency for formatted totals and labels. */
export function setDisplayCurrency(code: string) {
	displayCurrency = code
}

/** Format a number as currency; null/undefined renders as an em dash. */
export function formatMoney(
	value: number | null | undefined,
	currency = displayCurrency,
	opts: { sign?: boolean } = {}
) {
	if (value === null || value === undefined) {
		return "—"
	}
	let formatter = money.get(currency)
	if (!formatter) {
		formatter = new Intl.NumberFormat("en-CA", {
			style: "currency",
			currency,
		})
		money.set(currency, formatter)
	}
	const formatted = formatter.format(Math.abs(value))
	if (value < 0) {
		return `−${formatted}`
	}
	return opts.sign && value > 0 ? `+${formatted}` : formatted
}

/** ISO calendar date → "Nov 24, 2026" in en-CA. */
export function formatDate(iso: string) {
	const [y, m, d] = iso.split("-").map(Number)
	return new Date(y, m - 1, d).toLocaleDateString("en-CA", {
		month: "short",
		day: "numeric",
		year: "numeric",
	})
}

/** SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) or a full ISO timestamp. */
export function parseUtc(value: string) {
	return new Date(
		/[zZ]$|[+-]\d\d:?\d\d$/.test(value)
			? value
			: `${value.replace(" ", "T")}Z`
	).getTime()
}

/** The calendar date (YYYY-MM-DD) a stored UTC timestamp falls on in the viewer's own time zone. */
export function localDate(sqliteUtc: string) {
	return isoDate(new Date(parseUtc(sqliteUtc)))
}

/** Relative time from a stored UTC timestamp ("just now", "3h ago", or a short date). */
export function formatRelative(sqliteUtc: string | null) {
	if (!sqliteUtc) {
		return "never"
	}
	const at = parseUtc(sqliteUtc)
	const mins = Math.round((Date.now() - at) / 60000)
	if (mins < 0) {
		const ahead = -mins
		if (ahead < 60) {
			return `in ${ahead}m`
		}
		if (ahead < 24 * 60) {
			return `in ${Math.round(ahead / 60)}h`
		}
		return new Date(at).toLocaleDateString("en-CA", {
			month: "short",
			day: "numeric",
		})
	}
	if (mins < 1) {
		return "just now"
	}
	if (mins < 60) {
		return `${mins}m ago`
	}
	const hrs = Math.round(mins / 60)
	if (hrs < 24) {
		return `${hrs}h ago`
	}
	return new Date(at).toLocaleDateString("en-CA", {
		month: "short",
		day: "numeric",
	})
}

/** Short labels for account types in filters and pickers. */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
	chequing: "Chequing",
	savings: "Savings",
	credit: "Credit card",
	loan: "Borrowing",
	investment: "Investing",
	wallet: "Wallet",
	other: "Other",
}

const pad2 = (value: number) => String(value).padStart(2, "0")

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d = new Date()) {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Parse YYYY-MM-DD into a local-midnight Date. */
export function parseIso(iso: string) {
	const [y, m, d] = iso.split("-").map(Number)
	return new Date(y, m - 1, d)
}

/** Shift a calendar date by a number of days. */
export function addDays(iso: string, days: number) {
	const date = parseIso(iso)
	date.setDate(date.getDate() + days)
	return isoDate(date)
}

/** Whole days from today to `iso` (negative = past). */
export function daysFromToday(iso: string) {
	return Math.round(
		(parseIso(iso).getTime() - parseIso(isoDate()).getTime()) / 86_400_000
	)
}

const rtf = new Intl.RelativeTimeFormat("en-CA", { numeric: "auto" })

/** "today", "yesterday", "3 days ago", "in 2 weeks", "4 months ago" for a date-only value. */
export function formatRelativeDate(iso: string) {
	const days = daysFromToday(iso)
	const abs = Math.abs(days)
	if (abs < 7) {
		return rtf.format(days, "day")
	}
	if (abs < 30) {
		return rtf.format(Math.round(days / 7), "week")
	}
	if (abs < 365) {
		return rtf.format(Math.round(days / 30.44), "month")
	}
	return rtf.format(Math.round(days / 365.25), "year")
}

/** Full weekday date for detail views. */
export function formatLongDate(iso: string) {
	return parseIso(iso).toLocaleDateString("en-CA", {
		weekday: "long",
		month: "long",
		day: "numeric",
		year: "numeric",
	})
}

/** Compact month/day for tables and chips. */
export function formatShortDate(iso: string) {
	return parseIso(iso).toLocaleDateString("en-CA", {
		month: "short",
		day: "numeric",
	})
}

/** SQLite UTC timestamp → local "Nov 24, 2026, 3:12 p.m." */
export function formatTimestamp(sqliteUtc: string) {
	return new Date(parseUtc(sqliteUtc)).toLocaleString("en-CA", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	})
}

/** Format a YYYY-MM month key for charts and advisor copy. */
export function formatMonth(key: string, style: "short" | "long" = "short") {
	const [y, m] = key.split("-").map(Number)
	return new Date(y, m - 1, 1).toLocaleDateString("en-CA", {
		month: style,
		...(style === "long" ? { year: "numeric" } : {}),
	})
}

/** Compact axis money: $1.2k, $15k, $850. */
export function formatMoneyCompact(value: number, currency = displayCurrency) {
	const abs = Math.abs(value)
	const sign = value < 0 ? "−" : ""
	return `${sign}${currencySymbol(currency)}${compactNumber(abs)}`
}

function compactNumber(abs: number) {
	if (abs >= 1_000_000) {
		return `${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
	}
	if (abs >= 1000) {
		return `${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`
	}
	return String(Math.round(abs))
}

const symbols = new Map<string, string>()
/** "$" for CAD, "US$" for USD, "€" for EUR — as en-CA writes them, so CAD stays the plain "$". */
export function currencySymbol(currency: string) {
	let symbol = symbols.get(currency)
	if (symbol === undefined) {
		try {
			symbol =
				new Intl.NumberFormat("en-CA", { style: "currency", currency })
					.formatToParts(0)
					.find((part) => part.type === "currency")?.value ?? currency
		} catch {
			symbol = currency
		}
		symbols.set(currency, symbol)
	}
	return symbol
}

/** Date-group heading: "Today", "Yesterday", "Tuesday, November 24" (year added when it isn't this year). */
export function formatDayHeading(iso: string) {
	const days = daysFromToday(iso)
	if (days === 0) {
		return "Today"
	}
	if (days === -1) {
		return "Yesterday"
	}
	const sameYear = iso.slice(0, 4) === isoDate().slice(0, 4)
	return parseIso(iso).toLocaleDateString("en-CA", {
		weekday: "long",
		month: "long",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	})
}
