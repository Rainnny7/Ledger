import { db } from "../db/connection.ts"
import { notification } from "../db/schema/index.ts"
import { eq } from "drizzle-orm"
import type { Persona } from "./personas.ts"

function formatMoney(currency: string, amount: number): string {
	return new Intl.NumberFormat("en-CA", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	}).format(amount)
}

function priorMonthLabel(today: Date): string {
	const prior = new Date(
		Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
	)
	return prior.toLocaleString("en-CA", { month: "long", year: "numeric" })
}

function atOffset(today: Date, offsetMs: number): string {
	return new Date(today.getTime() - offsetMs).toISOString()
}

/** Sample in-app notifications for a demo persona (refreshed on every reseed). */
export function seedDemoNotifications(
	today: Date,
	persona: Persona,
	userId: string
) {
	db.delete(notification).where(eq(notification.userId, userId)).run()

	const currency = persona.currency
	const month = priorMonthLabel(today)
	const income =
		persona.pay.every === "biweekly"
			? Math.round(persona.pay.amount * 2.17)
			: persona.pay.amount
	const spent = Math.round(
		(income +
			persona.rent.amount +
			persona.savingsTransfer +
			persona.phone.amount) *
			0.42
	)
	const budgetCategory = persona.budgets[0]?.[0] ?? "groceries"
	const budgetLimit = persona.budgets[0]?.[1] ?? 400
	const budgetSpent = Math.round(budgetLimit * 1.12)
	const goalName = persona.id === "musk" ? "Mars habitat fund" : "Japan trip"

	const minute = 60_000
	const hour = 60 * minute
	const day = 24 * hour

	const rows: (typeof notification.$inferInsert)[] = [
		{
			id: `demo:notif:digest:${persona.id}`,
			userId,
			kind: "info",
			source: "digest",
			title: `Your ${month} spending digest`,
			body: `You spent ${formatMoney(currency, spent)} and earned ${formatMoney(currency, income)} in ${month}. Dining and subscriptions were higher than usual—see highlights on Insights.`,
			href: "/insights",
			readAt: null,
			createdAt: atOffset(today, 12 * minute),
		},
		{
			id: `demo:notif:sign-in:${persona.id}`,
			userId,
			kind: "warning",
			source: "security",
			title: "New sign-in to your account",
			body: "We noticed a sign-in from Chrome on Windows in Toronto, ON. If that wasn't you, change your password in Settings.",
			href: "/?settings=security",
			readAt: atOffset(today, 3 * hour + 20 * minute),
			createdAt: atOffset(today, 5 * hour),
		},
		{
			id: `demo:notif:admin-welcome:${persona.id}`,
			userId,
			kind: "info",
			source: "admin",
			title: "Welcome to Ledger",
			body: `Hi ${persona.name.split(" ")[0]}, your demo workspace is ready. Connect accounts, set budgets, and explore Insights with sample data.`,
			href: "/",
			readAt: atOffset(today, day + 2 * hour),
			createdAt: atOffset(today, day + hour),
		},
		{
			id: `demo:notif:bank:${persona.id}`,
			userId,
			kind: "warning",
			source: "security",
			title: `${persona.id === "musk" ? "TD Private Banking" : "TD EasyWeb"} needs you to sign in again`,
			body: "Your bank session expired. Open the dashboard and reconnect so balances and transactions stay up to date.",
			href: "/",
			readAt: null,
			createdAt: atOffset(today, day + 4 * hour),
		},
		{
			id: `demo:notif:budget:${persona.id}`,
			userId,
			kind: "alert",
			source: null,
			title: `${budgetCategory} budget exceeded`,
			body: `You've spent ${formatMoney(currency, budgetSpent)} this month against a ${formatMoney(currency, budgetLimit)} ${budgetCategory} budget.`,
			href: "/advisor",
			readAt: null,
			createdAt: atOffset(today, 3 * day),
		},
		{
			id: `demo:notif:goal:${persona.id}`,
			userId,
			kind: "success",
			source: null,
			title: `Milestone reached: ${goalName}`,
			body: `You're past 50% of your ${goalName} target. Keep it up—review progress and upcoming payments on Goals.`,
			href: "/goals",
			readAt: atOffset(today, 14 * day + 3 * hour),
			createdAt: atOffset(today, 14 * day),
		},
		{
			id: `demo:notif:transaction:${persona.id}`,
			userId,
			kind: "alert",
			source: null,
			title: "Large card purchase",
			body: `A ${formatMoney(currency, Math.round(420 * persona.scale))} charge on ${persona.accounts.visa} cleared today. Categorize or split it from Transactions if needed.`,
			href: "/transactions",
			readAt: null,
			createdAt: atOffset(today, 7 * hour),
		},
		{
			id: `demo:notif:maintenance:${persona.id}`,
			userId,
			kind: "info",
			source: "admin",
			title: "Scheduled maintenance complete",
			body: "Last night's database maintenance finished without issues. Syncs and digests are running on schedule again.",
			href: null,
			readAt: atOffset(today, 3 * day + 6 * hour),
			createdAt: atOffset(today, 3 * day + 5 * hour),
		},
	]

	db.insert(notification).values(rows).run()
}
