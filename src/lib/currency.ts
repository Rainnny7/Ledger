import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { type Account, api, type FxRates, type Transaction } from "./api"
import { useSession } from "./auth-client"
import { useDemoPrefs } from "./demo"

/** Currencies with daily reference rates (ECB), so anything picked here can be converted. */
export const CURRENCIES = [
	"CAD",
	"USD",
	"EUR",
	"GBP",
	"AUD",
	"NZD",
	"CHF",
	"JPY",
	"CNY",
	"HKD",
	"SGD",
	"KRW",
	"INR",
	"ILS",
	"MXN",
	"BRL",
	"ZAR",
	"SEK",
	"NOK",
	"DKK",
	"ISK",
	"PLN",
	"CZK",
	"HUF",
	"RON",
	"TRY",
	"THB",
	"PHP",
	"IDR",
	"MYR",
] as const

const names =
	typeof Intl.DisplayNames === "function"
		? new Intl.DisplayNames(["en"], { type: "currency" })
		: null

/** "US Dollar" for "USD" (falls back to the code). */
export function currencyName(code: string) {
	try {
		return names?.of(code) ?? code
	} catch {
		return code
	}
}

// Currency → the flag shown beside it (ISO 3166 region, or "eu" for the euro).
const CURRENCY_FLAG: Record<string, string> = {
	CAD: "ca",
	USD: "us",
	EUR: "eu",
	GBP: "gb",
	AUD: "au",
	NZD: "nz",
	CHF: "ch",
	JPY: "jp",
	CNY: "cn",
	HKD: "hk",
	SGD: "sg",
	KRW: "kr",
	INR: "in",
	ILS: "il",
	MXN: "mx",
	BRL: "br",
	ZAR: "za",
	SEK: "se",
	NOK: "no",
	DKK: "dk",
	ISK: "is",
	PLN: "pl",
	CZK: "cz",
	HUF: "hu",
	RON: "ro",
	TRY: "tr",
	THB: "th",
	PHP: "ph",
	IDR: "id",
	MYR: "my",
}

/** A flag image for a currency (most codes start with their country's), or null when there isn't one. */
export function currencyFlagUrl(code: string): string | null {
	const region =
		CURRENCY_FLAG[code] ??
		(/^[A-Z]{3}$/.test(code) && !code.startsWith("X")
			? code.slice(0, 2).toLowerCase()
			: null)
	return region ? `https://flagcdn.com/${region}.svg` : null
}

/** Codes for a picker, always including `current` (an account or bill can be in anything). */
export function currencyOptions(current?: string | null): string[] {
	const list: string[] = [...CURRENCIES]
	if (current && !list.includes(current)) {
		list.unshift(current)
	}
	return list
}

// Time zone → currency. The zone says where the device is without asking for location access, and
// is a better hint than the browser language (plenty of people outside the US use en-US).
const ZONE_CURRENCY: [RegExp, string][] = [
	[
		/^America\/(Toronto|Montreal|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Moncton|Whitehorse|Yellowknife|Iqaluit|Glace_Bay|Goose_Bay|Swift_Current|Dawson_Creek|Fort_Nelson|Creston|Thunder_Bay|Nipigon|Rainy_River|Rankin_Inlet|Resolute|Cambridge_Bay|Inuvik|Atikokan|Blanc-Sablon|Dawson|Coral_Harbour)$|^Canada\//,
		"CAD",
	],
	[
		/^America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ojinaga|Hermosillo|Mazatlan|Bahia_Banderas|Tijuana|Ensenada|Ciudad_Juarez)$|^Mexico\//,
		"MXN",
	],
	[
		/^America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Santarem|Noronha)$|^Brazil\//,
		"BRL",
	],
	[
		/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Juneau|Sitka|Nome|Adak|Boise|Detroit|Indiana\/.+|Kentucky\/.+|North_Dakota\/.+|Menominee|Metlakatla|Yakutat|Puerto_Rico)$|^US\/|^Pacific\/Honolulu$/,
		"USD",
	],
	[/^Europe\/(London|Belfast|Guernsey|Jersey|Isle_of_Man)$|^GB/, "GBP"],
	[/^Europe\/(Zurich|Vaduz)$/, "CHF"],
	[/^Europe\/Stockholm$/, "SEK"],
	[/^(Europe\/Oslo|Arctic\/Longyearbyen)$/, "NOK"],
	[/^(Europe\/Copenhagen|America\/Nuuk|Atlantic\/Faroe)$/, "DKK"],
	[/^Atlantic\/Reykjavik$/, "ISK"],
	[/^Europe\/Warsaw$/, "PLN"],
	[/^Europe\/Prague$/, "CZK"],
	[/^Europe\/Budapest$/, "HUF"],
	[/^Europe\/Bucharest$/, "RON"],
	[/^(Europe|Asia)\/Istanbul$/, "TRY"],
	[
		/^Europe\/(Berlin|Paris|Madrid|Rome|Amsterdam|Brussels|Vienna|Dublin|Lisbon|Helsinki|Athens|Luxembourg|Bratislava|Ljubljana|Tallinn|Riga|Vilnius|Valletta|Zagreb|Monaco|San_Marino|Vatican|Andorra|Busingen)$|^Asia\/(Nicosia|Famagusta)$|^Atlantic\/(Canary|Madeira|Azores)$/,
		"EUR",
	],
	[/^Asia\/(Jerusalem|Tel_Aviv)$|^Israel$/, "ILS"],
	[/^Asia\/(Kolkata|Calcutta)$/, "INR"],
	[/^Asia\/Tokyo$|^Japan$/, "JPY"],
	[/^Asia\/(Shanghai|Chongqing|Harbin|Urumqi)$|^PRC$/, "CNY"],
	[/^Asia\/Hong_Kong$|^Hongkong$/, "HKD"],
	[/^Asia\/Singapore$|^Singapore$/, "SGD"],
	[/^Asia\/Seoul$|^ROK$/, "KRW"],
	[/^Asia\/Bangkok$/, "THB"],
	[/^Asia\/Manila$/, "PHP"],
	[/^Asia\/(Jakarta|Makassar|Jayapura|Pontianak)$/, "IDR"],
	[/^Asia\/(Kuala_Lumpur|Kuching)$/, "MYR"],
	[/^Australia\//, "AUD"],
	[/^Pacific\/(Auckland|Chatham)$|^NZ$/, "NZD"],
	[/^Africa\/Johannesburg$/, "ZAR"],
]

const REGION_CURRENCY: Record<string, string> = {
	CA: "CAD",
	US: "USD",
	GB: "GBP",
	AU: "AUD",
	NZ: "NZD",
	CH: "CHF",
	JP: "JPY",
	CN: "CNY",
	HK: "HKD",
	SG: "SGD",
	KR: "KRW",
	IN: "INR",
	IL: "ILS",
	MX: "MXN",
	BR: "BRL",
	ZA: "ZAR",
	SE: "SEK",
	NO: "NOK",
	DK: "DKK",
	IS: "ISK",
	PL: "PLN",
	CZ: "CZK",
	HU: "HUF",
	RO: "RON",
	TR: "TRY",
	TH: "THB",
	PH: "PHP",
	ID: "IDR",
	MY: "MYR",
	DE: "EUR",
	FR: "EUR",
	ES: "EUR",
	IT: "EUR",
	NL: "EUR",
	BE: "EUR",
	AT: "EUR",
	IE: "EUR",
	PT: "EUR",
	FI: "EUR",
	GR: "EUR",
	LU: "EUR",
	SK: "EUR",
	SI: "EUR",
	EE: "EUR",
	LV: "EUR",
	LT: "EUR",
	CY: "EUR",
	MT: "EUR",
	HR: "EUR",
}

/** A best guess at this person's currency from where their device is set to (no prompts, nothing sent). */
export function detectCurrency(): string {
	try {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
		const byZone = ZONE_CURRENCY.find(([re]) => re.test(zone))?.[1]
		if (byZone) {
			return byZone
		}
	} catch {
		// Fall through to the language region.
	}
	for (const lang of navigator.languages ?? [navigator.language]) {
		try {
			const region = new Intl.Locale(lang).maximize().region
			if (region && REGION_CURRENCY[region]) {
				return REGION_CURRENCY[region]
			}
		} catch {
			// Ignore malformed tags.
		}
	}
	return "USD"
}

/** The currency saved on the account, if any. */
export const savedCurrency = (user: unknown) =>
	(user as { currency?: string | null } | undefined)?.currency || null

/** The currency totals are shown in: the one picked in Settings, else a guess from this device. */
export function useHomeCurrency(): string {
	const { data } = useSession()
	const demo = useDemoPrefs()
	return demo.currency ?? savedCurrency(data?.user) ?? detectCurrency()
}

/** Daily FX rates from the server (cached for an hour). */
export const useFx = () =>
	useQuery({
		queryKey: ["fx"],
		queryFn: api.fx,
		staleTime: 60 * 60_000,
		gcTime: 24 * 60 * 60_000,
	}).data ?? null

/** amount in `from` → `to`; null when there's no rate for one of them (yet). */
export function convertAmount(
	amount: number,
	from: string,
	to: string,
	fx: FxRates | null
): number | null {
	if (from === to) {
		return amount
	}
	const fromRate = fx?.rates[from]
	const toRate = fx?.rates[to]
	if (!fromRate || !toRate) {
		return null
	}
	return (amount / fromRate) * toRate
}

/** Home-currency conversion helpers backed by today's reference rates. */
export interface Converter {
	/** The currency everything is converted into. */
	home: string
	fx: FxRates | null
	/** amount in `from` → home currency, or null when it can't be converted. */
	to: (amount: number, from: string) => number | null
	/** Like `to`, but falls back to the unconverted amount (for sums that shouldn't vanish). */
	toOr: (amount: number, from: string) => number
	/** Sum of `[amount, currency]` pairs in the home currency. */
	sum: (items: Iterable<readonly [number, string]>) => number
	/** Which of these currencies can't be converted right now. */
	missing: (currencies: Iterable<string>) => string[]
	/** Whether any of these differ from the home currency (totals are then approximate). */
	mixed: (currencies: Iterable<string>) => boolean
}

/** Converts amounts into the home currency at today's reference rates. */
export function useConverter(): Converter {
	const home = useHomeCurrency()
	const fx = useFx()
	return useMemo(() => {
		const to = (amount: number, from: string) =>
			convertAmount(amount, from, home, fx)
		const toOr = (amount: number, from: string) =>
			to(amount, from) ?? amount
		return {
			home,
			fx,
			to,
			toOr,
			sum: (items) => {
				let total = 0
				for (const [amount, currency] of items) {
					total += toOr(amount, currency)
				}
				return total
			},
			missing: (currencies) =>
				[...new Set(currencies)].filter((code) => to(1, code) === null),
			mixed: (currencies) =>
				[...currencies].some((code) => code !== home),
		}
	}, [home, fx])
}

/**
 * Accounts and their transactions restated in the home currency, so balances and spending across
 * currencies add up. Accounts whose currency has no rate yet are left out rather than added at face value.
 */
export function inHomeCurrency(
	accounts: Account[],
	transactions: Transaction[],
	c: Converter
) {
	const factor = new Map<string, number>()
	const converted: Account[] = []
	for (const account of accounts) {
		const rate = c.to(1, account.currency)
		if (rate === null) {
			continue
		}
		factor.set(account.id, rate)
		if (account.currency === c.home) {
			converted.push(account)
			continue
		}
		const scale = (value: number | null) =>
			value === null ? null : value * rate
		converted.push({
			...account,
			currency: c.home,
			balance: scale(account.balance),
			available: scale(account.available),
			overdraftLimit: scale(account.overdraftLimit),
			overdraftUsed: scale(account.overdraftUsed),
			creditLimit: scale(account.creditLimit),
		})
	}
	const txs: Transaction[] = []
	for (const transaction of transactions) {
		const rate = factor.get(transaction.accountId)
		if (rate === undefined) {
			continue
		}
		txs.push(
			rate === 1
				? transaction
				: {
						...transaction,
						amount: transaction.amount * rate,
						runningBalance:
							transaction.runningBalance === null
								? null
								: transaction.runningBalance * rate,
					}
		)
	}
	const skipped = [
		...new Set(
			accounts
				.filter((account) => !factor.has(account.id))
				.map((account) => account.currency)
		),
	]
	const mixed = accounts.some((account) => account.currency !== c.home)
	return { accounts: converted, transactions: txs, skipped, mixed }
}
