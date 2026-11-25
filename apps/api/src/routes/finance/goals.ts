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
import { fromCents, toCents } from "@ledger/shared/money"
import { and, asc, eq } from "drizzle-orm"
import { db } from "../../db/connection.ts"
import { goal, goalPayment } from "../../db/schema/index.ts"
import { todayIso } from "../../time/today.ts"
import {
	GOAL_KINDS,
	type GoalPaymentRow,
	type GoalRow,
	summarizeGoal,
} from "../../finance/goals.ts"
import {
	access,
	canEdit,
	forgetItem,
	listWithShared,
	viewOne,
} from "../../sharing/access.ts"
import { loadTransactions } from "./transactions.ts"

function loadGoals(userId: string, goalId?: string) {
	const goals = db
		.select({
			id: goal.id,
			name: goal.name,
			kind: goal.kind,
			target: goal.target,
			currency: goal.currency,
			targetDate: goal.targetDate,
			icon: goal.icon,
			color: goal.color,
			notes: goal.notes,
			archived: goal.archived,
			createdAt: goal.createdAt,
		})
		.from(goal)
		.where(
			goalId
				? and(eq(goal.userId, userId), eq(goal.id, goalId))
				: eq(goal.userId, userId)
		)
		.orderBy(...(goalId ? [] : [asc(goal.createdAt)]))
		.all() as GoalRow[]
	if (goals.length === 0) {
		return []
	}
	const payments: GoalPaymentRow[] = db
		.select({
			id: goalPayment.id,
			goalId: goalPayment.goalId,
			amount: goalPayment.amount,
			date: goalPayment.date,
			note: goalPayment.note,
			transactionId: goalPayment.transactionId,
			createdAt: goalPayment.createdAt,
		})
		.from(goalPayment)
		.innerJoin(goal, eq(goal.id, goalPayment.goalId))
		.where(eq(goal.userId, userId))
		.all()
	const today = todayIso()
	return goals.map((goalRow) =>
		summarizeGoal(
			{ ...goalRow, target: fromCents(goalRow.target) },
			payments
				.filter((payment) => payment.goalId === goalRow.id)
				.map((payment) => ({
					...payment,
					amount: fromCents(payment.amount),
				})),
			today
		)
	)
}

const goalFor = (ownerId: string, goalId: string) =>
	loadGoals(ownerId, goalId)[0]
const viewGoal = (userId: string, goalId: string) =>
	viewOne("goal", userId, goalId, goalFor)

const canEditGoal = (userId: string, goalId: string) =>
	canEdit(access(userId, "goal", goalId))

const idParam = z.object({ id: id })
const goalPidParam = z.object({ id: id, pid: id })

const goalBody = z.object({
	name: boundedString(80).trim().min(1),
	kind: z.enum(GOAL_KINDS).default("save"),
	target: money.refine((target) => target > 0, "Target must be positive"),
	currency: currencyCode.default("CAD"),
	targetDate: isoDate.nullable().optional(),
	icon: z
		.string()
		.regex(/^[a-z-]{1,32}$/)
		.default("target"),
	color: z
		.string()
		.regex(/^[a-z-]{1,32}$/)
		.default("sunset"),
	notes: boundedString(500).nullable().optional(),
	archived: z.boolean().default(false),
	startingAmount: money
		.refine((amount) => amount >= 0, "Amount cannot be negative")
		.optional(),
})

/** Elysia plugin wiring HTTP handlers for this area. */
export const goalRoutes = new Elysia({ name: "finance-goals" }).use(sessionUser)

goalRoutes.get("/goals", ({ user }) => ({
	goals: listWithShared("goal", user.id, loadGoals, goalFor),
}))

goalRoutes.post(
	"/goals",
	async ({ user, body }) => {
		const payload = body
		const goalId = randomUUID()
		db.insert(goal)
			.values({
				id: goalId,
				userId: user.id,
				name: payload.name,
				kind: payload.kind,
				target: toCents(payload.target),
				currency: payload.currency.toUpperCase(),
				targetDate: payload.targetDate ?? null,
				icon: payload.icon,
				color: payload.color,
				notes: payload.notes?.trim() || null,
				archived: payload.archived,
			})
			.run()
		if (payload.startingAmount && payload.startingAmount > 0) {
			db.insert(goalPayment)
				.values({
					id: randomUUID(),
					goalId,
					amount: toCents(payload.startingAmount),
					date: todayIso(),
					note:
						payload.kind === "payoff"
							? "Already paid"
							: "Already saved",
				})
				.run()
		}
		return { goal: viewGoal(user.id, goalId) }
	},
	{ body: jsonBody(goalBody) }
)

const patchGoalBody = goalBody.omit({ startingAmount: true }).partial()

goalRoutes.patch(
	"/goals/:id",
	async ({ user, params, body, status }) => {
		const { id: goalId } = params
		const userAccess = access(user.id, "goal", goalId)
		if (!userAccess) {
			return status(404, { error: "Not found" })
		}
		if (!canEdit(userAccess)) {
			return status(403, { error: "You can only view this goal." })
		}
		if (userAccess.role !== "owner") {
			delete body.archived
		}
		const changes: Partial<typeof goal.$inferInsert> = {}
		if (body.name !== undefined) {
			changes.name = body.name
		}
		if (body.kind !== undefined) {
			changes.kind = body.kind
		}
		if (body.target !== undefined) {
			changes.target = toCents(body.target)
		}
		if (body.currency !== undefined) {
			changes.currency = body.currency
		}
		if (body.targetDate !== undefined) {
			changes.targetDate = body.targetDate
		}
		if (body.icon !== undefined) {
			changes.icon = body.icon
		}
		if (body.color !== undefined) {
			changes.color = body.color
		}
		if (body.notes !== undefined) {
			changes.notes = body.notes?.trim() || null
		}
		if (body.archived !== undefined) {
			changes.archived = body.archived
		}
		if (Object.keys(changes).length > 0) {
			db.update(goal)
				.set(changes)
				.where(
					and(
						eq(goal.id, goalId),
						eq(goal.userId, userAccess.ownerId)
					)
				)
				.run()
		}
		const viewedGoal = viewGoal(user.id, goalId)
		return viewedGoal
			? { goal: viewedGoal }
			: status(404, { error: "Not found" })
	},
	{ params: idParam, body: jsonBody(patchGoalBody) }
)

goalRoutes.delete(
	"/goals/:id",
	({ user, params, status }) => {
		const { id: goalId } = params
		const result = db
			.delete(goal)
			.where(and(eq(goal.id, goalId), eq(goal.userId, user.id)))
			.returning({ id: goal.id })
			.all()
		if (result.length) {
			forgetItem("goal", goalId)
		}
		return result.length
			? { ok: true }
			: status(404, { error: "Not found" })
	},
	{ params: idParam }
)

const paymentBody = z.object({
	amount: money.refine((amount) => amount !== 0, "Amount can’t be zero"),
	date: isoDate,
	note: boundedString(200).nullable().optional(),
	transactionId: id.nullable().optional(),
})

goalRoutes.post(
	"/goals/:id/payments",
	async ({ user, params, body, status }) => {
		const payload = body
		const userId = user.id
		const { id: goalId } = params
		if (!canEditGoal(userId, goalId)) {
			return status(404, { error: "Not found" })
		}
		// Only the owner's bank can be linked: an editor's transaction would be a foreign reference.
		if (payload.transactionId) {
			if (access(userId, "goal", goalId)?.role !== "owner") {
				return status(403, {
					error: "Only the owner can link a bank transaction.",
				})
			}
			if (
				loadTransactions(userId, { id: payload.transactionId })
					.length === 0
			) {
				return status(400, { error: "Unknown transaction" })
			}
		}
		db.insert(goalPayment)
			.values({
				id: randomUUID(),
				goalId,
				amount: toCents(payload.amount),
				date: payload.date,
				note: payload.note?.trim() || null,
				transactionId: payload.transactionId ?? null,
			})
			.run()
		return { goal: viewGoal(userId, goalId) }
	},
	{ params: idParam, body: jsonBody(paymentBody) }
)

goalRoutes.delete(
	"/goals/:id/payments/:pid",
	({ user, params, status }) => {
		const userId = user.id
		const { id: goalId, pid } = params
		const role = access(userId, "goal", goalId)?.role
		if (!role) {
			return status(404, { error: "Not found" })
		}
		if (role !== "owner") {
			return status(403, { error: "Only the owner can delete this." })
		}
		const result = db
			.delete(goalPayment)
			.where(and(eq(goalPayment.id, pid), eq(goalPayment.goalId, goalId)))
			.returning({ id: goalPayment.id })
			.all()
		return result.length
			? { goal: viewGoal(userId, goalId) }
			: status(404, { error: "Not found" })
	},
	{ params: goalPidParam }
)
