/**
 * Turns raw bank descriptions ("UBER CANADA/UBE _V", "TIM HORTONS #1234") into a clean
 * merchant name, a stable merchant key, and a spending category. Pure functions — unit-tested.
 */

import type { Category } from "../../shared/categories.ts"

interface Known {
	re: RegExp
	name: string
	category: Category
}

/** Well-known merchants: matched first, give a nice display name. Order matters (Uber Eats before Uber). */
const KNOWN: Known[] = [
	{ re: /uber\s*\*?\s*eats|ubereats/i, name: "Uber Eats", category: "food" },
	{ re: /\buber\b/i, name: "Uber", category: "transport" },
	{ re: /\blyft\b/i, name: "Lyft", category: "transport" },
	{ re: /doordash/i, name: "DoorDash", category: "food" },
	{
		re: /skip\s*the\s*dishes|skipthedishes/i,
		name: "SkipTheDishes",
		category: "food",
	},
	{ re: /tim\s*horton/i, name: "Tim Hortons", category: "food" },
	{ re: /mcdonald/i, name: "McDonald's", category: "food" },
	{ re: /starbucks/i, name: "Starbucks", category: "food" },
	{ re: /^usat\b|^usat_/i, name: "Vending machine", category: "food" },
	{ re: /netflix/i, name: "Netflix", category: "subscriptions" },
	{ re: /spotify/i, name: "Spotify", category: "subscriptions" },
	{
		re: /disney\s*\+|disneyplus/i,
		name: "Disney+",
		category: "subscriptions",
	},
	{ re: /\bcrave\b/i, name: "Crave", category: "subscriptions" },
	{
		re: /amazon\S*\s*prime|prime\s*video|amzn\s*prime/i,
		name: "Amazon Prime",
		category: "subscriptions",
	},
	{
		re: /apple\.com\/bill|^apple\.c(om)?\b|itunes/i,
		name: "Apple",
		category: "subscriptions",
	},
	{
		re: /youtube\s*(premium|music)?|google\s*\*?\s*youtube/i,
		name: "YouTube",
		category: "subscriptions",
	},
	{
		re: /google\s*\*?\s*(storage|one|gsuite|workspace)/i,
		name: "Google One",
		category: "subscriptions",
	},
	{ re: /openai|chatgpt/i, name: "OpenAI", category: "subscriptions" },
	{
		re: /anthropic|claude\.ai/i,
		name: "Anthropic",
		category: "subscriptions",
	},
	{ re: /patreon/i, name: "Patreon", category: "subscriptions" },
	{
		re: /xbox|microsoft\s*\*?\s*(store|xbox|365)/i,
		name: "Microsoft",
		category: "subscriptions",
	},
	{
		re: /playstation|sony\s*interactive/i,
		name: "PlayStation",
		category: "entertainment",
	},
	{
		re: /\bsteam\b|steampowered|valve/i,
		name: "Steam",
		category: "entertainment",
	},
	{ re: /nintendo/i, name: "Nintendo", category: "entertainment" },
	{ re: /epic\s*games/i, name: "Epic Games", category: "entertainment" },
	{ re: /twitch/i, name: "Twitch", category: "entertainment" },
	{ re: /cineple/i, name: "Cineplex", category: "entertainment" },
	{ re: /ticketmaster/i, name: "Ticketmaster", category: "entertainment" },
	{ re: /telus/i, name: "Telus", category: "bills" },
	{ re: /rogers/i, name: "Rogers", category: "bills" },
	{
		re: /\bbell\s*(canada|mobility|media)?\b/i,
		name: "Bell",
		category: "bills",
	},
	{ re: /\bfido\b/i, name: "Fido", category: "bills" },
	{ re: /koodo/i, name: "Koodo", category: "bills" },
	{ re: /freedom\s*mobile/i, name: "Freedom Mobile", category: "bills" },
	{ re: /virgin\s*(plus|mobile)/i, name: "Virgin Plus", category: "bills" },
	{ re: /amazon|amzn/i, name: "Amazon", category: "shopping" },
	{ re: /wal-?mart/i, name: "Walmart", category: "shopping" },
	{ re: /costco/i, name: "Costco", category: "groceries" },
	{ re: /best\s*buy/i, name: "Best Buy", category: "shopping" },
	{ re: /canadian\s*tire/i, name: "Canadian Tire", category: "shopping" },
	{ re: /dollarama/i, name: "Dollarama", category: "shopping" },
	{ re: /shoppers\s*drug/i, name: "Shoppers Drug Mart", category: "health" },
	{ re: /petro[\s-]*can/i, name: "Petro-Canada", category: "transport" },
	{ re: /\besso\b/i, name: "Esso", category: "transport" },
	{ re: /\bshell\b/i, name: "Shell", category: "transport" },
	{ re: /\bpresto\b/i, name: "PRESTO", category: "transport" },
	{ re: /uber\s*direct/i, name: "Uber Direct", category: "shopping" },
	{
		re: /metrolinx|\bgo\s*transit\b/i,
		name: "GO Transit",
		category: "transport",
	},
	{ re: /via\s*rail/i, name: "VIA Rail", category: "transport" },
	{ re: /giant\s*tiger/i, name: "Giant Tiger", category: "shopping" },
	{ re: /fairstone/i, name: "Fairstone", category: "debt" },
	{ re: /easy\s*financial/i, name: "easyfinancial", category: "debt" },
	{ re: /paypal/i, name: "PayPal", category: "shopping" },
]

/** Category rules for everything else, checked against the raw description. */
const RULES: { re: RegExp; category: Category; sign?: "in" | "out" }[] = [
	// Loan repayments: money leaves, but it pays down a balance rather than buying anything. Before
	// transfers, whose "pymt" would otherwise claim "LOAN PYMT".
	{
		re: /lendcare|spring\s*financial|\bmogo\b|nslsc|student\s*loan|\bosap\b|loan\s*(pmt|pymt|payment)/i,
		category: "debt",
		sign: "out",
	},
	{
		re: /payroll|pay\s*roll|salary|direct\s*dep|\bpay\b.*\bdep|canada\s*(fed|gst|child)|gst\s*credit|cra\s*(refund|tax)|ei\s*canada/i,
		category: "income",
		sign: "in",
	},
	{
		re: /e-?\s*tfr|e-?transfer|interac|\btfr\b|transfer|\bto\s*c\/c\b|payment\s*-?\s*thank\s*you|visa\s*payment|cc\s*payment|wealthsimple|questrade|\bws\s*invest|mb-?\s*(credit\s*card|loc)|pymt|bill\s*pmt.*td\s*visa|currency\s*conversion/i,
		category: "transfers",
	},
	{
		re: /\bfee\b|fees|service\s*charge|monthly\s*plan|\bnsf\b|overdraft|od\s*(handling|int)|\bint\b.*(od|overdraft)|annual\s*fee/i,
		category: "fees",
	},
	{ re: /interest/i, category: "income", sign: "in" },
	{ re: /interest/i, category: "fees", sign: "out" },
	{ re: /\batm\b|\bw\/d\b|withdraw|cash\s*adv|abm/i, category: "cash" },
	{
		re: /hydro|enbridge|utilit|insurance|\bins\b|\brent\b|property\s*tax|city\s*of|water\s*bill|internet|wireless|mobility|teksavvy|cogeco|\bshaw\b|videotron/i,
		category: "bills",
	},
	{
		re: /loblaw|no\s*frills|sobeys|\bmetro\b|food\s*basics|freshco|superstore|safeway|save-?on|farm\s*boy|t\s*&\s*t|longo|whole\s*foods|grocery|grocer|market|fortinos|zehrs|iga\b|maxi\b|provigo|walmart\s*supercentre/i,
		category: "groceries",
	},
	{
		re: /restaurant|resto|pizza|burger|sushi|cafe|caf[ée]|coffee|bistro|grill|\bbar\b|\bpub\b|kitchen|diner|tacos?|shawarma|pho|ramen|a\s*&\s*w|wendy|subway|kfc|popeyes|chipotle|harvey|dairy\s*queen|domino|pizza\s*pizza|little\s*caesar|five\s*guys|mary\s*brown|osmow|freshii|bakery|donut|tea\b|chatime|boba|deli/i,
		category: "food",
	},
	{
		re: /gas\b|fuel|husky|pioneer|ultramar|circle\s*k|parking|impark|green\s*p|\bttc\b|transit|\bgo\s*transit\b|via\s*rail|taxi|car\s*wash|\b407\b/i,
		category: "transport",
	},
	{
		re: /pharma|rexall|dental|dentist|clinic|physio|optom|medical|health|goodlife|fit4less|planet\s*fitness|\bgym\b|la\s*fitness/i,
		category: "health",
	},
	{
		re: /netflix|spotify|subscription|membership|\bplus\b|premium/i,
		category: "subscriptions",
	},
	{
		re: /cinema|theatre|theater|movie|concert|game|bowling|golf|arcade|museum|tickets?\b/i,
		category: "entertainment",
	},
	{
		re: /store|shop|mart|winners|marshalls|homesense|ikea|sephora|h\s*&\s*m|zara|uniqlo|old\s*navy|gap\b|ebay|etsy|aliexpress|temu|shein|indigo|staples|home\s*depot|lowe'?s|rona|sport\s*chek|apple\s*store/i,
		category: "shopping",
	},
]

const SMALL_WORDS = new Set(["and", "of", "the", "to", "at", "in", "on", "for"])

function titleCase(s: string) {
	return s
		.toLowerCase()
		.split(" ")
		.map((word, i) => {
			if (!word) {
				return word
			}
			if (i > 0 && SMALL_WORDS.has(word)) {
				return word
			}
			if (/\.(ca|com|net|org|io)$/.test(word)) {
				return word.charAt(0).toUpperCase() + word.slice(1)
			}
			return word.charAt(0).toUpperCase() + word.slice(1)
		})
		.join(" ")
}

/** Payment processors that prefix the real merchant ("PAYPAL *SPOTIFY", "SQ *CAFE"). */
const PROCESSOR =
	/^(sq ?\*|tst[*-] ?|pp\*|paypal ?\*|sp ?\*|dd ?\*|ic\*|py ?\*)/i

/**
 * Strip TD's channel suffixes (_V visa debit, _M mastercard…), processor prefixes, dates,
 * foreign-currency amounts, store numbers and city noise.
 */
export function stripNoise(desc: string): string {
	let cleaned = desc.replace(/\s+/g, " ").trim()
	cleaned = cleaned.replace(/\s+_[A-Z]{1,2}$/i, "")
	// Suffix glued to a number: "UBER CAN REV 11/20_V", "CURSOR, AI 20.00_V".
	cleaned = cleaned.replace(/(?<=\d)_[A-Z]{1,2}$/i, "")
	// Original foreign-currency amount ("CURSOR, AI 20.00").
	cleaned = cleaned.replace(/\s+\d+\.\d{2}$/, "")
	// Dates baked into the description ("PODP FEE SEP/10/2025", "REV 11/20").
	cleaned = cleaned.replace(
		/\s*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[/ -]\d{1,2}([/ -]\d{2,4})?\b/gi,
		""
	)
	cleaned = cleaned.replace(/\s*\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, "")
	cleaned = cleaned.replace(PROCESSOR, "")
	cleaned = cleaned.replace(
		/^([oaf]?pos |visa debit (pur|rfnd)\s*-?\s*|purchase\s*-\s*)/i,
		""
	)
	cleaned = cleaned.replace(/\s*#\s*\d+.*$/, "")
	cleaned = cleaned.replace(/\s+\d{4,}.*$/, "")
	cleaned = cleaned.replace(/[*_]+\s*\w{0,12}$/, (match) =>
		/\d/.test(match) ? "" : match
	)
	// Per-payment reference codes ("FAIRSTONE RF Y4U5X7", "VIA RAIL/6WXCVQ") would make every
	// charge a different merchant: drop a trailing token of 5+ letters and digits mixed.
	cleaned = cleaned.replace(/[\s/](?=[a-z]*\d)(?=\d*[a-z])[a-z0-9]{5,}$/i, "")
	cleaned = cleaned.replace(/\s+rf$/i, "") // "RF" (reference) left behind by the line above
	cleaned = cleaned.replace(/\/\w{1,4}$/, "") // "UBER CANADA/UBE"
	cleaned = cleaned.replace(/\s+(on|qc|bc|ab|mb|sk|ns|nb|nl|pe)\s*$/i, "")
	return cleaned.trim() || desc.trim()
}

/** Shape of Classified as stored and returned by the API. */
export interface Classified {
	merchant: string
	merchantKey: string
	category: Category
}

/** Stable grouping key from a transaction description. */
export function merchantKeyOf(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

/** Classify one transaction. `amount` sign matters (negative = money out). */
/**
 * Results by description and sign. Every list of transactions is classified on each request, and
 * the same few thousand descriptions come up over and over, so the regex work is done once each.
 */
const classified = new Map<string, Classified>()
const CACHE_LIMIT = 50_000

/** Merchant name, merchant key and automatic category for a bank description. */
export function classify(description: string, amount: number): Classified {
	const key = `${Math.sign(amount)}|${description}`
	const hit = classified.get(key)
	if (hit) {
		return hit
	}
	const result = classifyUncached(description, amount)
	if (classified.size >= CACHE_LIMIT) {
		classified.clear()
	}
	classified.set(key, result)
	return result
}

function classifyUncached(description: string, amount: number): Classified {
	const raw = description.replace(/\s+/g, " ").trim()
	const cleaned = stripNoise(raw)

	// E-transfers keep the counterparty-free label so they group together.
	if (/e-?\s*tfr|e-?transfer/i.test(raw)) {
		const name = amount < 0 ? "e-Transfer sent" : "e-Transfer received"
		return {
			merchant: name,
			merchantKey: merchantKeyOf(name),
			category: "transfers",
		}
	}

	// Match the cleaned name first so "PAYPAL *SPOTIFY" is Spotify, not PayPal. The raw text is
	// the fallback (some patterns need words stripNoise removes), except for processor-prefixed
	// charges, where the raw text would only ever say "PayPal".
	const known =
		KNOWN.find((knownMerchant) => knownMerchant.re.test(cleaned)) ??
		(PROCESSOR.test(raw)
			? undefined
			: KNOWN.find((knownMerchant) => knownMerchant.re.test(raw)))
	const viaPaypal = /^paypal ?\*|^pp\*/i.test(raw)
	// PayPal truncates names ("PAYPAL *DI"); keep the processor in tiny ones so they stay readable.
	const merchant =
		known?.name ??
		(viaPaypal && cleaned.length < 4
			? `PayPal ${cleaned}`
			: titleCase(cleaned))
	let category: Category = known?.category ?? "other"

	if (!known) {
		const dir = amount < 0 ? "out" : "in"
		const rule = RULES.find(
			(candidateRule) =>
				(!candidateRule.sign || candidateRule.sign === dir) &&
				candidateRule.re.test(PROCESSOR.test(raw) ? cleaned : raw)
		)
		if (rule) {
			category = rule.category
		}
		// Money arriving "from PayPal" is a withdrawal of a PayPal balance; unknown PayPal spending is shopping.
		else if (viaPaypal) {
			category = amount > 0 ? "transfers" : "shopping"
		}
	}
	// Money coming back from a shop is a refund, not income; anything else positive & unknown is income.
	if (amount > 0 && category === "other") {
		category = "income"
	}

	return { merchant, merchantKey: merchantKeyOf(merchant), category }
}
