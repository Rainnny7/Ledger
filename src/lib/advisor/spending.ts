import type { Category } from "../api"
import { addDays, parseIso } from "../format"
import type { Tip, Ctx } from "./types"
import {
	formatMoney,
	about,
	formatPercent,
	plural,
	label,
	lowercaseCategory,
	isSpend,
	link,
	merchantsOf,
	monthOf,
	dayOf,
	daysInMonth,
	ordinal,
	spendBy,
	DISCRETIONARY,
} from "./helpers"

const meanSpend = (maps: Map<Category, number>[], category: Category) =>
	maps.reduce(
		(sum, monthMap) => sum + Math.max(0, monthMap.get(category) ?? 0),
		0
	) / maps.length

const discretionarySum = (categoryTotals: Map<Category, number>) =>
	[...categoryTotals].reduce(
		(total, [category, amount]) =>
			DISCRETIONARY.has(category) ? total + amount : total,
		0
	)

/**
 * This month so far vs what you'd usually have spent by this day of the month, per category.
 * Comparing like-for-like days keeps rent-on-the-1st style bills from looking like a spike.
 */
export function paceTips(context: Ctx): Tip[] {
	const day = dayOf(context.today)
	if (day < 5 || context.months.length < 2) {
		return []
	}
	const now = spendBy(
		context.transactions.filter(
			(transaction) => monthOf(transaction.date) === context.thisMonth
		)
	)
	const byDay = context.months.map((monthKey) => {
		const cut = `${monthKey}-${String(Math.min(day, daysInMonth(monthKey))).padStart(2, "0")}`
		return spendBy(
			context.transactions.filter(
				(transaction) =>
					monthOf(transaction.date) === monthKey &&
					transaction.date <= cut
			)
		)
	})
	const full = context.months.map((monthKey) =>
		spendBy(
			context.transactions.filter(
				(transaction) => monthOf(transaction.date) === monthKey
			)
		)
	)
	const tips: Tip[] = []
	let hot: {
		c: Category
		spent: number
		usual: number
		month: number
		over: number
	}[] = []
	for (const [c, spent] of now) {
		const usual = meanSpend(byDay, c)
		const over = spent - usual
		if (spent < 60 || over < 40 || spent < usual * 1.3) {
			continue
		}
		hot.push({ c, spent, usual, month: meanSpend(full, c), over })
	}
	hot = hot.toSorted((left, right) => right.over - left.over)
	for (const hotspot of hot.slice(0, 2)) {
		const landing =
			hotspot.spent + Math.max(0, hotspot.month - hotspot.usual)
		tips.push({
			id: `pace:${hotspot.c}:${context.thisMonth}`,
			kind: "warn",
			area: "spending",
			title: `${label(hotspot.c)} is running ahead of usual`,
			body:
				`You’ve spent ${formatMoney(hotspot.spent)} on ${lowercaseCategory(hotspot.c)} so far this month. By the ${ordinal(day)} you’d usually be at about ${about(hotspot.usual)}` +
				(hotspot.month > 0
					? `, and the rest of the month typically adds ${about(Math.max(0, hotspot.month - hotspot.usual))}, so you’re heading for roughly ${about(landing)} against a usual ${about(hotspot.month)}.`
					: "."),
			action: {
				label: `See ${lowercaseCategory(hotspot.c)} this month`,
				to: link("/transactions", {
					category: hotspot.c,
					from: `${context.thisMonth}-01`,
				}),
			},
			priority: 300 + Math.min(90, hotspot.over / 10),
		})
	}

	// Overall discretionary spending well under the usual pace is worth saying out loud.
	const spentNow = discretionarySum(now)
	const usualNow =
		byDay.reduce((sum, monthMap) => sum + discretionarySum(monthMap), 0) /
		byDay.length
	if (
		day >= 10 &&
		usualNow > 100 &&
		spentNow < usualNow * 0.85 &&
		usualNow - spentNow >= 50
	) {
		tips.push({
			id: `pace-win:${context.thisMonth}`,
			kind: "win",
			area: "spending",
			title: "You’re spending less than usual this month",
			body: `Day-to-day spending is ${formatMoney(spentNow)} so far, about ${about(usualNow - spentNow)} (${formatPercent(1 - spentNow / usualNow)}) below where you usually are by the ${ordinal(day)}. Keep it up and consider moving the difference to savings.`,
			priority: 40,
		})
	}
	return tips
}

const COFFEE =
	/coffee|caf[eé]|espresso|starbucks|tim hortons|\btims\b|second cup|balzac|dunkin|peet|pret a manger|costa\b|blenz|bridgehead/i
const DELIVERY =
	/uber\s*eats|doordash|door dash|skip\s*the\s*dishes|skipthedishes|grubhub|deliveroo|postmates|foodora|just eat|menulog|seamless|fantuan/i

/** Small purchases that add up: coffee runs, delivery apps, and any merchant you visit very often. */
export function habitTips(context: Ctx): Tip[] {
	const from = addDays(context.today, -30)
	const recent = context.transactions.filter(
		(transaction) =>
			transaction.date > from &&
			transaction.amount < 0 &&
			isSpend(transaction)
	)
	const tips: Tip[] = []
	const scale = 365 / 30

	const coffee = recent.filter(
		(transaction) =>
			COFFEE.test(transaction.merchant) ||
			COFFEE.test(transaction.description)
	)
	const coffeeTotal = coffee.reduce(
		(sum, transaction) => sum - transaction.amount,
		0
	)
	if (coffee.length >= 6 && coffeeTotal >= 25) {
		const places = new Set(
			coffee.map((transaction) => transaction.merchant)
		).size
		tips.push({
			id: `habit:coffee:${context.thisMonth}`,
			kind: "save",
			area: "spending",
			title: "Your coffee runs add up",
			body: `${plural(coffee.length, "coffee purchase")} in the last 30 days${places > 1 ? ` across ${places} places` : ""}, ${formatMoney(coffeeTotal)} in all (about ${formatMoney(coffeeTotal / coffee.length)} each). That’s roughly ${about(coffeeTotal * scale)} a year; making half of them at home would keep about ${about((coffeeTotal * scale) / 2)}.`,
			yearly: (coffeeTotal * scale) / 2,
			action: {
				label: "See purchases",
				to: link("/transactions", {
					merchants: merchantsOf(coffee),
					from: addDays(context.today, -29),
				}),
			},
			priority: 200 + Math.min(80, coffeeTotal / 5),
		})
	}

	const delivery = recent.filter(
		(transaction) =>
			DELIVERY.test(transaction.merchant) ||
			DELIVERY.test(transaction.description)
	)
	const deliveryTotal = delivery.reduce(
		(sum, transaction) => sum - transaction.amount,
		0
	)
	if (delivery.length >= 3 && deliveryTotal >= 60) {
		tips.push({
			id: `habit:delivery:${context.thisMonth}`,
			kind: "save",
			area: "spending",
			title: "Delivery apps cost more than they look",
			body: `${plural(delivery.length, "delivery order")} in the last 30 days came to ${formatMoney(deliveryTotal)}. Service fees, delivery fees and menu markups often add 20–30%; picking up the same order yourself, or cooking one of those nights, would save around ${about(deliveryTotal * scale * 0.25)} a year.`,
			yearly: deliveryTotal * scale * 0.25,
			action: {
				label: "See orders",
				to: link("/transactions", {
					merchants: merchantsOf(delivery),
					from: addDays(context.today, -29),
				}),
			},
			priority: 200 + Math.min(80, deliveryTotal / 8),
		})
	}

	// Any other merchant you're at constantly, for small amounts each time.
	const counted = new Set(
		[...coffee, ...delivery].map((transaction) => transaction.id)
	)
	const byMerchant = new Map<
		string,
		{ name: string; count: number; total: number }
	>()
	for (const transaction of recent) {
		if (
			counted.has(transaction.id) ||
			-transaction.amount > 25 ||
			!DISCRETIONARY.has(transaction.category)
		) {
			continue
		}
		const row = byMerchant.get(transaction.merchantKey) ?? {
			name: transaction.merchant,
			count: 0,
			total: 0,
		}
		row.count++
		row.total -= transaction.amount
		byMerchant.set(transaction.merchantKey, row)
	}
	const frequent = [...byMerchant.entries()]
		.filter(([, stats]) => stats.count >= 8 && stats.total >= 40)
		.toSorted((left, right) => right[1].total - left[1].total)
	for (const [key, stats] of frequent.slice(0, 1)) {
		tips.push({
			id: `habit:${key}:${context.thisMonth}`,
			kind: "save",
			area: "spending",
			title: `${stats.name} is a regular stop`,
			body: `${plural(stats.count, "purchase")} at ${stats.name} in the last 30 days, ${formatMoney(stats.total)} in total. Small, frequent buys are the easiest to trim: cutting them by a third saves about ${about((stats.total * scale) / 3)} a year.`,
			yearly: (stats.total * scale) / 3,
			action: {
				label: "See purchases",
				to: link("/transactions", {
					merchants: key,
					from: addDays(context.today, -29),
				}),
			},
			priority: 180 + Math.min(60, stats.total / 5),
		})
	}
	return tips
}

/** Eating out vs groceries over the last 90 days. */
export function diningTips(context: Ctx): Tip[] {
	const from = addDays(context.today, -90)
	if (context.transactions.at(-1)!.date > addDays(from, 14)) {
		return []
	}
	const by = spendBy(
		context.transactions.filter((transaction) => transaction.date > from)
	)
	const food = Math.max(0, by.get("food") ?? 0)
	const groceries = Math.max(0, by.get("groceries") ?? 0)
	if (food < 150 || food <= groceries * 1.1) {
		return []
	}
	const yearly = ((food * 365) / 90) * 0.25
	return [
		{
			id: `dining:${context.thisMonth}`,
			kind: "save",
			area: "spending",
			title: "Eating out costs more than your groceries",
			body: `In the last 90 days you spent ${formatMoney(food)} at restaurants, cafés and takeout and ${formatMoney(groceries)} on groceries. Swapping a quarter of those meals for home cooking would save about ${about(yearly)} a year.`,
			yearly,
			action: {
				label: "See eating out",
				to: link("/insights", { range: "90d", category: "food" }),
			},
			priority: 190 + Math.min(60, food / 50),
		},
	]
}

/** Whether day-to-day spending clusters on weekends. */
export function weekendTips(context: Ctx): Tip[] {
	const from = addDays(context.today, -84) // 12 whole weeks
	if (context.transactions.at(-1)!.date > from) {
		return []
	}
	let weekend = 0
	let weekday = 0
	for (const transaction of context.transactions) {
		if (
			transaction.date <= from ||
			!DISCRETIONARY.has(transaction.category)
		) {
			continue
		}
		const dow = parseIso(transaction.date).getDay()
		if (dow === 0 || dow === 6) {
			weekend -= transaction.amount
		} else {
			weekday -= transaction.amount
		}
	}
	const perWeekend = weekend / 24
	const perWeekday = weekday / 60
	if (weekend < 200 || perWeekday <= 0 || perWeekend < perWeekday * 1.75) {
		return []
	}
	return [
		{
			id: `weekend:${context.thisMonth}`,
			kind: "info",
			area: "spending",
			title: "Weekends are where the money goes",
			action: {
				label: "See spending",
				to: link("/insights", { range: "90d" }),
			},
			body: `Over the last 12 weeks you spent about ${formatMoney(perWeekend)} per weekend day on eating out, shopping and fun, ${(perWeekend / perWeekday).toFixed(1)}× a typical weekday. Planning one low-spend weekend a month is an easy win.`,
			priority: 120,
		},
	]
}
