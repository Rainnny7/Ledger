import { roundMoney } from "@ledger/shared/money"
import { type Draft, toIsoDate, createRandom } from "./util.ts"

/** The billionaire: quarterly distributions and stock sales in, jets, rockets and lawyers out. */
export function generateMogul(today: Date) {
	const rand = createRandom(20240611)
	const between = (lo: number, hi: number) =>
		roundMoney(lo + rand() * (hi - lo))
	const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
	const start = new Date(
		Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth() - 1, 1)
	)
	const chequing: Draft[] = []
	const savings: Draft[] = []
	const visa: Draft[] = []
	const paypal: Draft[] = []
	const end = toIsoDate(today)
	for (
		let cursorDate = new Date(start);
		toIsoDate(cursorDate) <= end;
		cursorDate.setUTCDate(cursorDate.getUTCDate() + 1)
	) {
		const day = toIsoDate(cursorDate)
		const dom = cursorDate.getUTCDate()
		const dow = cursorDate.getUTCDay()
		const month = cursorDate.getUTCMonth()
		const daysSince = Math.round(
			(cursorDate.getTime() - start.getTime()) / 86_400_000
		)
		const add = (list: Draft[], description: string, amount: number) =>
			list.push({ date: day, description, amount })

		// Income: dividends each quarter, and the odd block of shares sold.
		if (dom === 1 && month % 3 === 0) {
			add(
				chequing,
				"SPACEX DISTRIBUTION",
				between(110_000_000, 135_000_000)
			)
		}
		if (dom === 10 && month % 4 === 2) {
			add(
				chequing,
				"TESLA STOCK SALE PROCEEDS",
				between(440_000_000, 520_000_000)
			)
		}
		// Property, staff and the lawyers.
		if (dom === 1) {
			add(chequing, "STARBASE ESTATE UPKEEP", -285_000)
		}
		if (dom === 2) {
			add(chequing, "TFR-TO TREASURY RESERVE", -150_000_000)
			add(savings, "TFR-FR OPERATING 0001", 150_000_000)
		}
		if (dom === 5) {
			add(
				chequing,
				"STARBASE CONSTRUCTION DRAW",
				-between(3_500_000, 9_000_000)
			)
		}
		if (dow === 5 && Math.floor(daysSince / 7) % 2 === 0) {
			add(chequing, "HOUSEHOLD & STAFF PAYROLL", -96_500)
		}
		if (dom === 20) {
			add(chequing, "WACHTELL LEGAL RETAINER", -450_000)
		}
		if (dom === 24) {
			add(
				chequing,
				"STARLINK DISH ORDER (BULK)",
				-between(800_000, 2_400_000)
			)
		}
		if (rand() < 0.015) {
			add(chequing, "CRYPTO EXCHANGE DEBIT", -between(25_000, 420_000))
		}
		if (dom === 28) {
			add(savings, "INTEREST", roundMoney(11_000_000 + daysSince * 3_000))
		}
		if (dom === 18 && daysSince > 20) {
			// Pay last month's card spending.
			const prev = visa
				.filter(
					(transaction) =>
						transaction.amount < 0 &&
						transaction.date < day &&
						transaction.date >=
							toIsoDate(
								new Date(cursorDate.getTime() - 31 * 86_400_000)
							)
				)
				.reduce((total, transaction) => total - transaction.amount, 0)
			if (prev > 0) {
				add(chequing, "BLACK CARD PAYMENT", -roundMoney(prev))
				add(visa, "PAYMENT - THANK YOU", roundMoney(prev))
			}
		}

		// The Black Card: charters, gifts, and the occasional burger.
		if (rand() < 0.2) {
			add(
				visa,
				pick([
					"NETJETS CHARTER",
					"PRIVATE JET FUEL FBO",
					"FLEXJET CHARTER",
				]),
				-between(60_000, 240_000)
			)
		}
		if (rand() < 0.03) {
			add(visa, "TESLA CYBERTRUCK (GIFT)", -99_990)
		}
		if (dow >= 1 && dow <= 5 && rand() < 0.4) {
			add(
				visa,
				pick([
					"WHATABURGER #1128",
					"IN-N-OUT BURGER 231",
					"SWEETGREEN BROWNSVILLE",
				]),
				-between(9, 38)
			)
		}
		if (rand() < 0.1) {
			add(
				visa,
				pick([
					"SPACEX COMPANY STORE",
					"STARBASE MERCH & GEAR",
					"AMAZON.COM",
				]),
				-between(120, 6_800)
			)
		}
		if (rand() < 0.04) {
			add(
				visa,
				pick(["BEVERLY HILLS ART GALLERY", "SOTHEBYS"]),
				-between(80_000, 650_000)
			)
		}
		if (rand() < 0.05) {
			add(
				visa,
				"RESTAURANT BUYOUT (PRIVATE DINING)",
				-between(12_000, 60_000)
			)
		}
	}
	return { chequing, savings, visa, paypal }
}
