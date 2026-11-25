import { Elysia } from "elysia"
import { sessionUser } from "../session.ts"
import { randomUUID } from "node:crypto"
import { z } from "zod"
import {
	boundedString,
	currencyCode,
	id,
	isoDate,
	jsonBody,
	money,
} from "../../http/validation.ts"
import { CATEGORIES, type Cycle } from "../../../shared/categories.ts"
import {
	addCycle,
	amountTolerance,
	detectRecurring,
	isCycle,
	monthlyEquivalent,
	nextDue,
} from "../../finance/recurring.ts"
import { fromCents, toCents } from "../../../shared/money.ts"
import { db } from "../../db/connection.ts"
import { todayIso } from "../../time/today.ts"
import {
	access,
	canEdit,
	forgetItem,
	listWithShared,
} from "../../sharing/access.ts"
import { loadTransactions } from "./transactions.ts"

interface SubRow {
	id: string
	name: string
	amount: number
	currency: string
	cycle: Cycle
	anchorDate: string
	category: string
	accountId: string | null
	merchantKey: string | null
	notes: string | null
	active: number
	createdAt: string
}

const sameAmount = (left: number, right: number) =>
	Math.abs(Math.abs(left) - Math.abs(right)) <=
	amountTolerance(Math.abs(right))

function loadSubscriptions(userId: string, only?: string) {
	const subs = db
		.prepare(
			`SELECT id, name, amount, currency, cycle, anchor_date AS anchorDate, category, account_id AS accountId,
              merchant_key AS merchantKey, notes, active, created_at AS createdAt
         FROM subscription WHERE user_id = ? ${only ? "AND id = ?" : ""} ORDER BY name COLLATE NOCASE`
		)
		.all(...(only ? [userId, only] : [userId]))
		.map((row) => ({
			...(row as Record<string, unknown>),
			amount: fromCents((row as { amount: number }).amount),
		})) as unknown as SubRow[]
	const today = todayIso()
	const txs = loadTransactions(userId)

	// Charges counted toward a plan by hand, and which plan each one belongs to.
	const linkRows = db
		.prepare(
			`SELECT sc.subscription_id AS subId, sc.transaction_id AS txId
         FROM subscription_charge sc JOIN subscription s ON s.id = sc.subscription_id
        WHERE s.user_id = ?`
		)
		.all(userId) as { subId: string; txId: string }[]
	const linkedTo = new Map(linkRows.map((link) => [link.txId, link.subId]))
	const txById = new Map(
		txs.map((transaction) => [transaction.id, transaction])
	)
	/** What each plan's charges look like: its own merchant and price, plus every charge linked to it. */
	const patternsOf = (subscription: SubRow) => {
		const out: { merchantKey: string; amount: number }[] = []
		if (subscription.merchantKey) {
			out.push({
				merchantKey: subscription.merchantKey,
				amount: subscription.amount,
			})
		}
		for (const link of linkRows) {
			const transaction =
				link.subId === subscription.id
					? txById.get(link.txId)
					: undefined
			if (transaction) {
				out.push({
					merchantKey: transaction.merchantKey,
					amount: transaction.amount,
				})
			}
		}
		return out
	}

	const subscriptions = subs.map((subscription) => {
		// Charges from the merchant at roughly this plan's price (one merchant can bill several plans),
		// or like one linked to it, plus the linked ones themselves. A charge linked to another plan is
		// that plan's alone.
		const patterns = patternsOf(subscription)
		const payments = txs
			.filter((transaction) => {
				const owner = linkedTo.get(transaction.id)
				if (owner) {
					return owner === subscription.id
				}
				return (
					transaction.amount < 0 &&
					!transaction.fundsPaypal &&
					patterns.some(
						(pattern) =>
							pattern.merchantKey === transaction.merchantKey &&
							sameAmount(transaction.amount, pattern.amount)
					)
				)
			})
			.slice(0, 24)
			.map((transaction) => ({
				id: transaction.id,
				date: transaction.date,
				amount: transaction.amount,
				accountId: transaction.accountId as string | null,
				pending: transaction.pending,
				linked: linkedTo.get(transaction.id) === subscription.id,
			}))
		const last = payments[0]
		// A charge on/after the anchor proves that cycle was billed; the next one follows it.
		const base =
			last && last.date >= subscription.anchorDate
				? addCycle(last.date, subscription.cycle)
				: subscription.anchorDate
		return {
			...subscription,
			active: Boolean(subscription.active),
			nextDue: nextDue(base, subscription.cycle, today),
			monthly: monthlyEquivalent(subscription.amount, subscription.cycle),
			lastCharge: last ? { date: last.date, amount: last.amount } : null,
			payments,
		}
	})

	if (only) {
		return { subscriptions, suggestions: [] }
	}

	// Dismissals store a suggestion id ("merchant#amount"); older ones stored the bare merchant key.
	const dismissed = new Set(
		(
			db
				.prepare(
					`SELECT merchant_key AS k FROM subscription_dismissed WHERE user_id = ?`
				)
				.all(userId) as { k: string }[]
		).map((row) => row.k)
	)
	const guesses = detectRecurring(
		txs.filter((transaction) => !transaction.pending),
		today
	)
	const isTracked = (g: (typeof guesses)[number]) =>
		subs.some((subscription) =>
			patternsOf(subscription).some(
				(pattern) =>
					pattern.merchantKey === g.merchantKey &&
					// With a single guess for the merchant, any tracked plan covers it (its price may have moved).
					(sameAmount(g.amount, pattern.amount) ||
						guesses.filter(
							(other) => other.merchantKey === g.merchantKey
						).length === 1)
			)
		)
	const suggestions = guesses
		.filter(
			(guess) =>
				!isTracked(guess) &&
				!dismissed.has(guess.id) &&
				!dismissed.has(guess.merchantKey)
		)
		.map((guess) => ({
			...guess,
			accountId:
				txs.find(
					(transaction) =>
						transaction.merchantKey === guess.merchantKey &&
						sameAmount(transaction.amount, guess.amount)
				)?.accountId ?? null,
		}))

	return { subscriptions, suggestions }
}

/** Someone else's subscription as a person it's shared with sees it: without the owner's bank details. */
function sharedSubscription(ownerId: string, subId: string) {
	const subscription = loadSubscriptions(ownerId, subId).subscriptions[0]
	return (
		subscription && {
			...subscription,
			accountId: null,
			payments: subscription.payments.map((payment) => ({
				...payment,
				accountId: null,
			})),
		}
	)
}

const idParam = z.object({ id: id })
const txIdParam = z.object({ txId: id })

const subBody = z.object({
	name: boundedString(80).trim().min(1),
	amount: money.refine((amount) => amount > 0, "Amount must be positive"),
	currency: currencyCode.default("CAD"),
	cycle: boundedString(80).refine(isCycle, "Unknown billing period"),
	anchorDate: isoDate,
	category: z.enum(CATEGORIES).default("subscriptions"),
	accountId: id.nullable().optional(),
	merchantKey: boundedString(120).nullable().optional(),
	notes: boundedString(500).nullable().optional(),
	active: z.boolean().default(true),
})

const patchSubBody = subBody.partial()
const chargeBody = z.object({ subscriptionId: id.nullable() })
const dismissBody = z.object({ id: boundedString(140).min(1) })

function ownsAccount(userId: string, accountId: string | null | undefined) {
	if (!accountId) {
		return true
	}
	return !!db
		.prepare(
			`SELECT 1 FROM bank_account a JOIN bank_connection c ON c.id = a.connection_id WHERE a.id = ? AND c.user_id = ?`
		)
		.get(accountId, userId)
}

/** Elysia plugin wiring HTTP handlers for this area. */
export const subscriptionRoutes = new Elysia({
	name: "finance-subscriptions",
}).use(sessionUser)

subscriptionRoutes.get("/subscriptions", ({ user }) => {
	const userId = user.id
	const { subscriptions, suggestions } = loadSubscriptions(userId)
	return {
		subscriptions: listWithShared(
			"subscription",
			userId,
			() => subscriptions,
			sharedSubscription
		),
		suggestions,
	}
})

subscriptionRoutes.post(
	"/subscriptions",
	async ({ user, body, status }) => {
		const payload = body
		if (!ownsAccount(user.id, payload.accountId)) {
			return status(400, { error: "Unknown account" })
		}
		const subId = randomUUID()
		db.prepare(
			`INSERT INTO subscription (id, user_id, name, amount, currency, cycle, anchor_date, category, account_id, merchant_key, notes, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			subId,
			user.id,
			payload.name,
			toCents(payload.amount),
			payload.currency.toUpperCase(),
			payload.cycle,
			payload.anchorDate,
			payload.category,
			payload.accountId ?? null,
			payload.merchantKey ?? null,
			payload.notes?.trim() || null,
			payload.active ? 1 : 0
		)
		return { id: subId }
	},
	{ body: jsonBody(subBody) }
)

subscriptionRoutes.patch(
	"/subscriptions/:id",
	async ({ user, params, body, status }) => {
		const updates = { ...body }
		const { id: subId } = params
		const userAccess = access(user.id, "subscription", subId)
		if (!userAccess) {
			return status(404, { error: "Not found" })
		}
		if (!canEdit(userAccess)) {
			return status(403, {
				error: "You can only view this subscription.",
			})
		}
		if (userAccess.role !== "owner") {
			// Which account pays it, and the charges it matches, live in the owner's bank.
			delete updates.accountId
			delete updates.merchantKey
		}
		if (!ownsAccount(user.id, updates.accountId)) {
			return status(400, { error: "Unknown account" })
		}
		const cols: Record<string, string> = {
			name: "name",
			amount: "amount",
			currency: "currency",
			cycle: "cycle",
			anchorDate: "anchor_date",
			category: "category",
			accountId: "account_id",
			merchantKey: "merchant_key",
			notes: "notes",
			active: "active",
		}
		const sets: string[] = []
		const vals: (string | number | null)[] = []
		for (const [k, col] of Object.entries(cols)) {
			const fieldValue = (updates as Record<string, unknown>)[k]
			if (fieldValue === undefined) {
				continue
			}
			sets.push(`${col} = ?`)
			vals.push(
				typeof fieldValue === "boolean"
					? fieldValue
						? 1
						: 0
					: k === "amount"
						? toCents(fieldValue as number)
						: (fieldValue as string | number | null)
			)
		}
		if (sets.length === 0) {
			return { ok: true }
		}
		const result = db
			.prepare(
				`UPDATE subscription SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
			)
			.run(...vals, subId, userAccess.ownerId)
		return result.changes
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam, body: jsonBody(patchSubBody) }
)

subscriptionRoutes.delete(
	"/subscriptions/:id",
	({ user, params, status }) => {
		const { id: subId } = params
		const result = db
			.prepare(`DELETE FROM subscription WHERE id = ? AND user_id = ?`)
			.run(subId, user.id)
		if (result.changes) {
			forgetItem("subscription", subId)
		}
		return result.changes
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

/** Count a charge toward one of your subscriptions (moving it off any other), or stop counting it. */
subscriptionRoutes.put(
	"/subscriptions/charges/:txId",
	async ({ user, params, body, status }) => {
		const userId = user.id
		const { txId } = params
		const { subscriptionId } = body
		const transaction = loadTransactions(userId, { id: txId })[0]
		if (!transaction) {
			return status(404, { error: "Not found" })
		}
		let sub: { id: string; merchantKey: string | null } | undefined
		if (subscriptionId) {
			sub = db
				.prepare(
					`SELECT id, merchant_key AS merchantKey FROM subscription WHERE id = ? AND user_id = ?`
				)
				.get(subscriptionId, userId) as typeof sub
			if (!sub) {
				return status(400, { error: "Unknown subscription" })
			}
		}
		db.prepare(
			`DELETE FROM subscription_charge WHERE transaction_id = ?
       AND subscription_id IN (SELECT id FROM subscription WHERE user_id = ?)`
		).run(transaction.id, userId)
		if (sub) {
			db.prepare(
				`INSERT INTO subscription_charge (subscription_id, transaction_id) VALUES (?, ?)`
			).run(sub.id, transaction.id)
			// A plan that wasn't tied to a merchant yet follows this one from now on.
			if (!sub.merchantKey) {
				db.prepare(
					`UPDATE subscription SET merchant_key = ? WHERE id = ?`
				).run(transaction.merchantKey, sub.id)
			}
		}
		return { ok: true }
	},
	{ params: txIdParam, body: jsonBody(chargeBody) }
)

subscriptionRoutes.post(
	"/subscriptions/dismiss",
	({ user, body }) => {
		const { id: suggestionId } = body
		db.prepare(
			`INSERT OR IGNORE INTO subscription_dismissed (user_id, merchant_key) VALUES (?, ?)`
		).run(user.id, suggestionId)
		return { ok: true }
	},
	{ body: jsonBody(dismissBody) }
)
