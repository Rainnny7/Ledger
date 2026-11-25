import { getSetting, setSetting } from "../db/connection.ts"
import { convertCents, fromCents, toCents } from "@ledger/shared/money"
import { env } from "../config/env.ts"
import { validateFxRates } from "./validate.ts"

export { validateFxRates } from "./validate.ts"

/**
 * Exchange rates for showing totals in each person's own currency. Live mid-market rates come from
 * Coinbase's public rates endpoint (free, no key, no personal data sent), refreshed hourly. If that
 * fails, the European Central Bank's daily reference rates (through Frankfurter) are used instead.
 * The last good copy is kept in the database, so a failed fetch never breaks a page.
 */
export interface FxRates {
	/** Every rate is "1 base = rate × currency". */
	base: string
	/** The day the rates are for (YYYY-MM-DD): today for live rates, the publishing day for the ECB. */
	date: string
	rates: Record<string, number>
	/** When Ledger last fetched them (ISO), or null if it never could. */
	fetchedAt: string | null
	/** 'live' for current market rates, 'ecb' for the ECB's once-a-day fixing. */
	source: "live" | "ecb"
}

const KEY = "fx_rates"
/**
 * The "Update exchange rates" task keeps the saved copy current. This is only a safety net for when
 * the task hasn't run (a fresh install, or the server was off): past this age a page fetches them itself.
 */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000
/** After a failure, wait this long before asking again so pages don't each pay for a timeout. */
const RETRY_AFTER_MS = 10 * 60 * 1000
const NONE: FxRates = {
	base: "EUR",
	date: "",
	rates: { EUR: 1 },
	fetchedAt: null,
	source: "ecb",
}

/**
 * Real ISO 4217 codes. The live feed also lists crypto and odd codes (some three letters, like
 * "APE"), which no account would use and which could clash with a real code later.
 */
const ISO_CODES = new Set(Intl.supportedValuesOf("currency"))

let inflight: Promise<Fetched> | null = null
let lastFailure = 0

function cached(): FxRates | null {
	const raw = getSetting(KEY)
	if (!raw) {
		return null
	}
	try {
		const parsed = JSON.parse(raw) as FxRates
		return { ...parsed, source: parsed.source ?? "ecb" }
	} catch {
		return null
	}
}

const message = (error: unknown) =>
	error instanceof Error ? error.message : String(error)

async function getJson(url: string) {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(8000),
		headers: { Accept: "application/json" },
	})
	if (!response.ok) {
		throw new Error(`rates request failed (${response.status})`)
	}
	return (await response.json()) as unknown
}

function cleanRates(base: string, raw: Record<string, unknown>) {
	const rates: Record<string, number> = { [base]: 1 }
	for (const [code, value] of Object.entries(raw)) {
		const rate = typeof value === "string" ? Number(value) : value
		if (
			ISO_CODES.has(code) &&
			typeof rate === "number" &&
			rate > 0 &&
			Number.isFinite(rate)
		) {
			rates[code] = rate
		}
	}
	if (Object.keys(rates).length < 2) {
		throw new Error("the rates response had no rates in it")
	}
	return rates
}

/** Coinbase-style `{ data: { currency, rates: { CAD: "1.4256", … } } }`. */
async function fetchLive(): Promise<FxRates> {
	const body = (await getJson(env.FX_LIVE_URL)) as {
		data?: { currency?: unknown; rates?: unknown }
	}
	const base = body.data?.currency
	const raw = body.data?.rates
	if (typeof base !== "string" || !raw || typeof raw !== "object") {
		throw new Error("unexpected live rates response")
	}
	const now = new Date().toISOString()
	return {
		base,
		date: now.slice(0, 10),
		rates: cleanRates(base, raw as Record<string, unknown>),
		fetchedAt: now,
		source: "live",
	}
}

/** Frankfurter-style `{ base, date, rates: { CAD: 1.4327, … } }`. */
async function fetchEcb(): Promise<FxRates> {
	const body = (await getJson(env.FX_RATES_URL)) as {
		base?: unknown
		date?: unknown
		rates?: unknown
	}
	if (
		typeof body.base !== "string" ||
		typeof body.date !== "string" ||
		!body.rates ||
		typeof body.rates !== "object"
	) {
		throw new Error("unexpected ECB rates response")
	}
	const rates = cleanRates(body.base, body.rates as Record<string, unknown>)
	return {
		base: body.base,
		date: body.date,
		rates,
		fetchedAt: new Date().toISOString(),
		source: "ecb",
	}
}

interface Fetched {
	rates: FxRates
	/** Why the live rates couldn't be used, when it fell back to the ECB. */
	liveError?: string
}

async function fetchRates(): Promise<Fetched> {
	let liveError: string | undefined
	let rates: FxRates | undefined
	if (env.FX_LIVE_URL !== "off") {
		try {
			rates = await fetchLive()
		} catch (error) {
			liveError = message(error)
			console.warn(
				`[fx] live rates failed, using the ECB's instead: ${liveError}`
			)
		}
	}
	if (!rates) {
		try {
			rates = await fetchEcb()
		} catch (error) {
			throw new Error(
				liveError
					? `live rates: ${liveError}; ECB rates: ${message(error)}`
					: message(error),
				{ cause: error }
			)
		}
	}
	const previous = cached()
	validateFxRates(rates, previous)
	setSetting(KEY, JSON.stringify(rates))
	lastFailure = 0
	return { rates, liveError }
}

/** One fetch at a time, shared by the task and any page asking at the same moment. */
function fetchOnce(): Promise<Fetched> {
	inflight ??= fetchRates().finally(() => {
		inflight = null
	})
	return inflight
}

/**
 * For the "Update exchange rates" task: fetches the latest rates and says what it got. Throws when
 * every source fails, so the task shows as failed (pages keep using the saved copy).
 */
export async function refreshRates(): Promise<string> {
	const before = cached()
	try {
		const { rates: next, liveError } = await fetchOnce()
		const count = Object.keys(next.rates).length
		if (next.source === "live") {
			const time = new Date(next.fetchedAt ?? Date.now())
				.toISOString()
				.slice(11, 16)
			return `Live rates as of ${time} UTC · ${count} currencies`
		}
		const why = liveError
			? `Live rates unavailable (${liveError}), so using the ECB’s. `
			: ""
		if (before?.source === "ecb" && before.date === next.date) {
			return `${why}Still ${next.date}: the ECB hasn’t published a newer day yet · ${count} currencies`
		}
		return `${why}ECB rates for ${next.date} · ${count} currencies`
	} catch (error) {
		const saved = cached()
		if (saved && message(error).includes("FX ")) {
			throw new Error(
				`${message(error)}; kept the previous ${Object.keys(saved.rates).length}-currency set`,
				{ cause: error }
			)
		}
		throw error
	}
}

/** Current rates: the saved copy, or (if there's none or it's old) a new fetch falling back to it. */
export async function getRates(): Promise<FxRates> {
	const saved = cached()
	const fresh =
		saved?.fetchedAt &&
		Date.now() - Date.parse(saved.fetchedAt) < STALE_AFTER_MS
	if (saved && fresh) {
		return saved
	}
	if (Date.now() - lastFailure < RETRY_AFTER_MS) {
		return saved ?? NONE
	}
	return fetchOnce()
		.then((fxResponse) => fxResponse.rates)
		.catch((error) => {
			lastFailure = Date.now()
			console.warn(
				`[fx] could not refresh exchange rates: ${message(error)}`
			)
			return saved ?? NONE
		})
}

/** amount in `from` → `to`, or null when either currency has no rate. */
export function convert(
	amount: number,
	from: string,
	to: string,
	fx: FxRates
): number | null {
	if (from === to) {
		return amount
	}
	const fromRate = fx.rates[from]
	const toRate = fx.rates[to]
	if (!fromRate || !toRate) {
		return null
	}
	return fromCents(convertCents(toCents(amount), fromRate, toRate))
}
