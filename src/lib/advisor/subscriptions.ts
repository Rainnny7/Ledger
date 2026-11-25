import type { Subscription } from "../api"
import { shiftCycle } from "../cycles"
import { addDays, formatShortDate } from "../format"
import type { Tip, AdvisorInput, Ctx } from "./types"
import {
	roundToWhole,
	formatMoney,
	about,
	formatPercent,
	plural,
	subsLink,
	chargesPerYear,
} from "./helpers"

/** `OwnSub` type used in this module. */
export interface OwnSub {
	s: Subscription
	/** Price per charge, in the home currency. */
	price: number
	monthly: number
	yearly: number
}

/** Active subscriptions you pay for yourself (ones shared with you are someone else's bill). */
export function ownSubscriptions(input: AdvisorInput): OwnSub[] {
	return input.subscriptions
		.filter(
			(subscription) =>
				subscription.active && subscription.access === "owner"
		)
		.map((subscription) => {
			const price = input.toHome(
				subscription.amount,
				subscription.currency
			)
			const yearly = price * chargesPerYear(subscription.cycle)
			return { s: subscription, price, monthly: yearly / 12, yearly }
		})
}

const VIDEO =
	/netflix|disney|crave|prime\s*video|apple\s*tv|paramount|hulu|\bmax\b|hbo|peacock|youtube\s*(premium|tv)|britbox|mubi|dazn|curiosity|discovery\+|shudder|crunchyroll/i
const MUSIC =
	/spotify|apple\s*music|youtube\s*music|tidal|deezer|amazon\s*music|pandora|qobuz/i

const subscriptionOpenLink = (subscription: Subscription) =>
	subsLink(`Open ${subscription.name}`, [subscription.id])

/** `subscriptionTips` for this feature area. */
export function subscriptionTips(
	context: Ctx,
	subs: OwnSub[],
	yearlyTotal: number
): Tip[] {
	const tips: Tip[] = []
	const go = { label: "Review subscriptions", to: "/subscriptions" }

	if (subs.length > 0 && yearlyTotal > 0) {
		const share = context.hasIncome
			? yearlyTotal / 12 / context.avgIncome!
			: null
		tips.push({
			id: `subs-total:${subs.length}:${roundToWhole(yearlyTotal / 50)}`,
			kind: "info",
			area: "subscriptions",
			title: `Your subscriptions cost ${about(yearlyTotal)} a year`,
			body: `${plural(subs.length, "active subscription")} work out to ${formatMoney(yearlyTotal / 12)} a month${share !== null ? `, ${formatPercent(share)} of your income` : ""}. Going through them once a year and cancelling one you barely use is one of the easiest savings there is.`,
			action: go,
			priority: share !== null && share > 0.08 ? 230 : 110,
		})
	}

	// Overlapping services.
	for (const [kind, re, what] of [
		["video", VIDEO, "streaming services"],
		["music", MUSIC, "music services"],
	] as const) {
		const group = subs.filter(
			(owned) =>
				re.test(owned.s.name) || re.test(owned.s.merchantKey ?? "")
		)
		const min = kind === "video" ? 3 : 2
		if (group.length < min) {
			continue
		}
		const total = group.reduce((sum, owned) => sum + owned.monthly, 0)
		const keep = Math.max(...group.map((owned) => owned.monthly))
		tips.push({
			id: `overlap:${kind}:${group
				.map((owned) => owned.s.id)
				.toSorted()
				.join(",")}`,
			kind: "save",
			area: "subscriptions",
			title: `You pay for ${group.length} ${what}`,
			body:
				kind === "video"
					? `${group.map((owned) => owned.s.name).join(", ")} come to ${formatMoney(total)} a month. Keeping one at a time and switching when you've finished what you're watching would save about ${about((total - keep) * 12)} a year.`
					: `${group.map((owned) => owned.s.name).join(" and ")} overlap almost entirely and cost ${formatMoney(total)} a month together. Keeping just one saves about ${about((total - keep) * 12)} a year.`,
			yearly: (total - keep) * 12,
			action: subsLink(
				"Compare them",
				group.map((owned) => owned.s.id)
			),
			priority: 260,
		})
	}

	// Price increases, read from the actual charges (only for plans billed in the home currency,
	// so exchange-rate wobble isn't mistaken for a price change).
	for (const owned of subs) {
		const { s: subscription } = owned
		if (
			!subscription.merchantKey ||
			subscription.currency !== context.home
		) {
			continue
		}
		const charges = context.transactions
			.filter(
				(transaction) =>
					transaction.merchantKey === subscription.merchantKey &&
					transaction.amount < 0 &&
					!transaction.pending
			)
			.slice(0, 4)
		if (charges.length < 2) {
			continue
		}
		const [latest, prev, before] = charges.map(
			(transaction) => -transaction.amount
		)
		const stable =
			before === undefined || Math.abs(before - prev) <= prev * 0.01
		if (
			!stable ||
			latest < prev * 1.04 ||
			latest - prev < 0.5 ||
			charges[0].date < addDays(context.today, -75)
		) {
			continue
		}
		const yearly = (latest - prev) * chargesPerYear(subscription.cycle)
		tips.push({
			id: `price-up:${subscription.id}:${latest.toFixed(2)}`,
			kind: "warn",
			area: "subscriptions",
			title: `${subscription.name} went up in price`,
			body: `Your last charge on ${formatShortDate(charges[0].date)} was ${formatMoney(latest)}, up from ${formatMoney(prev)} (${formatPercent(latest / prev - 1)} more, about ${about(yearly)} a year). Worth checking whether a cheaper plan or an annual option fits.`,
			yearly: 0,
			action: subscriptionOpenLink(subscription),
			priority: 280,
		})
	}

	// Tracked as active, but the charges stopped.
	for (const owned of subs) {
		const { s: subscription } = owned
		if (
			!subscription.lastCharge ||
			chargesPerYear(subscription.cycle) < 1
		) {
			continue
		}
		const expected = shiftCycle(
			subscription.lastCharge.date,
			subscription.cycle,
			1
		)
		if (addDays(expected, 10) >= context.today) {
			continue
		}
		tips.push({
			id: `stale:${subscription.id}:${subscription.lastCharge.date}`,
			kind: "info",
			area: "subscriptions",
			title: `No charge from ${subscription.name} since ${formatShortDate(subscription.lastCharge.date)}`,
			body: `The next one was due around ${formatShortDate(expected)}. If you cancelled it, pause it so your totals stay right; if the price changed, update the amount, or open the latest charge and count it toward this subscription, so Ledger can match the charges again.`,
			action: subscriptionOpenLink(subscription),
			priority: 150,
		})
	}

	// Long-running monthly plans are often cheaper paid yearly.
	const longMonthly = subs
		.filter(
			(owned) =>
				owned.s.cycle === "monthly" &&
				owned.s.payments.length >= 6 &&
				owned.monthly >= 5
		)
		.toSorted((left, right) => right.monthly - left.monthly)
	if (longMonthly.length > 0) {
		const top = longMonthly.slice(0, 3)
		const yearly = top.reduce((sum, owned) => sum + owned.yearly, 0) * 0.15
		const names = top.map(
			(owned) => `${owned.s.name} (${owned.s.payments.length} months)`
		)
		tips.push({
			id: `annual:${top
				.map((owned) => owned.s.id)
				.toSorted()
				.join(",")}`,
			kind: "save",
			area: "subscriptions",
			title: "Switch long-running plans to yearly billing",
			body: `You've paid monthly for ${names.join(", ")}. Many services knock 15–20% off for paying yearly; if you're keeping them anyway, that's about ${about(yearly)} a year back.`,
			yearly,
			action: subsLink(
				"See these plans",
				top.map((owned) => owned.s.id)
			),
			priority: 170,
		})
	}

	// The single most expensive plan deserves a yearly "still worth it?".
	const priciest = [...subs].toSorted(
		(left, right) => right.monthly - left.monthly
	)[0]
	if (priciest && priciest.monthly >= 30 && priciest.s.category !== "bills") {
		tips.push({
			id: `priciest:${priciest.s.id}:${context.today.slice(0, 4)}`,
			kind: "info",
			area: "subscriptions",
			title: `Is ${priciest.s.name} still worth it?`,
			body: `It's your priciest subscription at ${formatMoney(priciest.monthly)} a month, ${about(priciest.yearly)} a year. If you're not using it every week, pausing or downgrading it is the biggest single subscription saving you have.`,
			action: subscriptionOpenLink(priciest.s),
			priority: 100,
		})
	}

	// Recurring charges Ledger spotted that aren't tracked yet.
	const untracked = context.suggestions
	if (untracked.length > 0) {
		const monthly = untracked.reduce(
			(sum, group) =>
				sum +
				(Math.abs(group.amount) * chargesPerYear(group.cycle)) / 12,
			0
		)
		tips.push({
			id: `untracked:${untracked
				.map((group) => group.id)
				.toSorted()
				.join(",")}`,
			kind: "info",
			area: "subscriptions",
			title: `${plural(untracked.length, "recurring charge")} you're not tracking`,
			body: `Ledger spotted ${untracked
				.slice(0, 3)
				.map((group) => group.name)
				.join(
					", "
				)}${untracked.length > 3 ? " and more" : ""} billing you regularly, about ${formatMoney(monthly)} a month. Track them to see every renewal coming, or dismiss the ones that aren't subscriptions.`,
			action: subsLink(
				"Review charges",
				untracked.map((group) => group.id)
			),
			priority: 210,
		})
	}
	return tips
}
