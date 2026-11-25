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
import { CATEGORIES, type Cycle } from "@ledger/shared/categories"
import {
	addCycle,
	amountTolerance,
	detectRecurring,
	isCycle,
	monthlyEquivalent,
	nextDue,
} from "../../finance/recurring.ts"
import { fromCents, toCents } from "@ledger/shared/money"
import { and, eq, inArray, sql } from "drizzle-orm"
import { db } from "../../db/connection.ts"
import {
	bankAccount,
	bankConnection,
	subscription as subscriptionTable,
	subscriptionCharge,
	subscriptionDismissed,
} from "../../db/schema/index.ts"
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
	active: boolean
	createdAt: string
}

const sameAmount = (left: number, right: number) =>
	Math.abs(Math.abs(left) - Math.abs(right)) <=
	amountTolerance(Math.abs(right))

function loadSubscriptions(userId: string, only?: string) {
	const subs = db
		.select({
			id: subscriptionTable.id,
			name: subscriptionTable.name,
			amount: subscriptionTable.amount,
			currency: subscriptionTable.currency,
			cycle: subscriptionTable.cycle,
			anchorDate: subscriptionTable.anchorDate,
			category: subscriptionTable.category,
			accountId: subscriptionTable.accountId,
			merchantKey: subscriptionTable.merchantKey,
			notes: subscriptionTable.notes,
			active: subscriptionTable.active,
			createdAt: subscriptionTable.createdAt,
		})
		.from(subscriptionTable)
		.where(
			only
				? and(
						eq(subscriptionTable.userId, userId),
						eq(subscriptionTable.id, only)
					)
				: eq(subscriptionTable.userId, userId)
		)
		.orderBy(sql`${subscriptionTable.name} COLLATE NOCASE`)
		.all()
		.map((row) => ({
			...row,
			amount: fromCents(row.amount),
		})) as SubRow[]
	const today = todayIso()
	const txs = loadTransactions(userId)

	// Charges counted toward a plan by hand, and which plan each one belongs to.
	const linkRows = db
		.select({
			subId: subscriptionCharge.subscriptionId,
			txId: subscriptionCharge.transactionId,
		})
		.from(subscriptionCharge)
		.innerJoin(
			subscriptionTable,
			eq(subscriptionTable.id, subscriptionCharge.subscriptionId)
		)
		.where(eq(subscriptionTable.userId, userId))
		.all()
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
		db
			.select({ key: subscriptionDismissed.merchantKey })
			.from(subscriptionDismissed)
			.where(eq(subscriptionDismissed.userId, userId))
			.all()
			.map((row) => row.key)
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
	return (
		db
			.select({ id: bankAccount.id })
			.from(bankAccount)
			.innerJoin(
				bankConnection,
				eq(bankConnection.id, bankAccount.connectionId)
			)
			.where(
				and(
					eq(bankAccount.id, accountId),
					eq(bankConnection.userId, userId)
				)
			)
			.get() !== undefined
	)
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
		db.insert(subscriptionTable)
			.values({
				id: subId,
				userId: user.id,
				name: payload.name,
				amount: toCents(payload.amount),
				currency: payload.currency.toUpperCase(),
				cycle: payload.cycle,
				anchorDate: payload.anchorDate,
				category: payload.category,
				accountId: payload.accountId ?? null,
				merchantKey: payload.merchantKey ?? null,
				notes: payload.notes?.trim() || null,
				active: payload.active,
			})
			.run()
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
		const changes: Partial<typeof subscriptionTable.$inferInsert> = {}
		if (updates.name !== undefined) {
			changes.name = updates.name
		}
		if (updates.amount !== undefined) {
			changes.amount = toCents(updates.amount)
		}
		if (updates.currency !== undefined) {
			changes.currency = updates.currency
		}
		if (updates.cycle !== undefined) {
			changes.cycle = updates.cycle
		}
		if (updates.anchorDate !== undefined) {
			changes.anchorDate = updates.anchorDate
		}
		if (updates.category !== undefined) {
			changes.category = updates.category
		}
		if (updates.accountId !== undefined) {
			changes.accountId = updates.accountId
		}
		if (updates.merchantKey !== undefined) {
			changes.merchantKey = updates.merchantKey
		}
		if (updates.notes !== undefined) {
			changes.notes = updates.notes
		}
		if (updates.active !== undefined) {
			changes.active = updates.active
		}
		if (Object.keys(changes).length === 0) {
			return { ok: true }
		}
		const result = db
			.update(subscriptionTable)
			.set(changes)
			.where(
				and(
					eq(subscriptionTable.id, subId),
					eq(subscriptionTable.userId, userAccess.ownerId)
				)
			)
			.returning({ id: subscriptionTable.id })
			.all()
		return result.length
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
			.delete(subscriptionTable)
			.where(
				and(
					eq(subscriptionTable.id, subId),
					eq(subscriptionTable.userId, user.id)
				)
			)
			.returning({ id: subscriptionTable.id })
			.all()
		if (result.length) {
			forgetItem("subscription", subId)
		}
		return result.length
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
				.select({
					id: subscriptionTable.id,
					merchantKey: subscriptionTable.merchantKey,
				})
				.from(subscriptionTable)
				.where(
					and(
						eq(subscriptionTable.id, subscriptionId),
						eq(subscriptionTable.userId, userId)
					)
				)
				.get()
			if (!sub) {
				return status(400, { error: "Unknown subscription" })
			}
		}
		db.delete(subscriptionCharge)
			.where(
				and(
					eq(subscriptionCharge.transactionId, transaction.id),
					inArray(
						subscriptionCharge.subscriptionId,
						db
							.select({ id: subscriptionTable.id })
							.from(subscriptionTable)
							.where(eq(subscriptionTable.userId, userId))
					)
				)
			)
			.run()
		if (sub) {
			db.insert(subscriptionCharge)
				.values({
					subscriptionId: sub.id,
					transactionId: transaction.id,
				})
				.run()
			// A plan that wasn't tied to a merchant yet follows this one from now on.
			if (!sub.merchantKey) {
				db.update(subscriptionTable)
					.set({ merchantKey: transaction.merchantKey })
					.where(eq(subscriptionTable.id, sub.id))
					.run()
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
		db.insert(subscriptionDismissed)
			.values({ userId: user.id, merchantKey: suggestionId })
			.onConflictDoNothing()
			.run()
		return { ok: true }
	},
	{ body: jsonBody(dismissBody) }
)
