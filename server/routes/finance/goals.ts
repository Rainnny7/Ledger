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
import { fromCents, toCents } from "../../../shared/money.ts"
import { db } from "../../db/connection.ts"
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

const GOAL_COLS = `id, name, kind, target, currency, target_date AS targetDate, icon, color, notes, archived, created_at AS createdAt`

function loadGoals(userId: string, goalId?: string) {
	const goals = (goalId
		? db
				.prepare(
					`SELECT ${GOAL_COLS} FROM goal WHERE user_id = ? AND id = ?`
				)
				.all(userId, goalId)
		: db
				.prepare(
					`SELECT ${GOAL_COLS} FROM goal WHERE user_id = ? ORDER BY created_at`
				)
				.all(userId)) as unknown as (Omit<GoalRow, "archived"> & {
		archived: number
	})[]
	if (goals.length === 0) {
		return []
	}
	const payments = db
		.prepare(
			`SELECT p.id, p.goal_id AS goalId, p.amount, p.date, p.note, p.transaction_id AS transactionId, p.created_at AS createdAt
         FROM goal_payment p JOIN goal g ON g.id = p.goal_id WHERE g.user_id = ?`
		)
		.all(userId) as unknown as GoalPaymentRow[]
	const today = todayIso()
	return goals.map((goal) =>
		summarizeGoal(
			{
				...goal,
				target: fromCents(goal.target),
				archived: Boolean(goal.archived),
			},
			payments
				.filter((payment) => payment.goalId === goal.id)
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
		db.prepare(
			`INSERT INTO goal (id, user_id, name, kind, target, currency, target_date, icon, color, notes, archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			goalId,
			user.id,
			payload.name,
			payload.kind,
			toCents(payload.target),
			payload.currency.toUpperCase(),
			payload.targetDate ?? null,
			payload.icon,
			payload.color,
			payload.notes?.trim() || null,
			payload.archived ? 1 : 0
		)
		if (payload.startingAmount && payload.startingAmount > 0) {
			db.prepare(
				`INSERT INTO goal_payment (id, goal_id, amount, date, note) VALUES (?, ?, ?, ?, ?)`
			).run(
				randomUUID(),
				goalId,
				toCents(payload.startingAmount),
				todayIso(),
				payload.kind === "payoff" ? "Already paid" : "Already saved"
			)
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
		const cols: Record<string, string> = {
			name: "name",
			kind: "kind",
			target: "target",
			currency: "currency",
			targetDate: "target_date",
			icon: "icon",
			color: "color",
			notes: "notes",
			archived: "archived",
		}
		const sets: string[] = []
		const vals: (string | number | null)[] = []
		for (const [k, col] of Object.entries(cols)) {
			const fieldValue = (body as Record<string, unknown>)[k]
			if (fieldValue === undefined) {
				continue
			}
			sets.push(`${col} = ?`)
			vals.push(
				typeof fieldValue === "boolean"
					? fieldValue
						? 1
						: 0
					: k === "notes"
						? (fieldValue as string | null)?.trim() || null
						: k === "target"
							? toCents(fieldValue as number)
							: (fieldValue as string | number | null)
			)
		}
		if (sets.length) {
			db.prepare(
				`UPDATE goal SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`
			).run(...vals, goalId, userAccess.ownerId)
		}
		const goal = viewGoal(user.id, goalId)
		return goal ? { goal } : status(404, { error: "Not found" })
	},
	{ params: idParam, body: jsonBody(patchGoalBody) }
)

goalRoutes.delete(
	"/goals/:id",
	({ user, params, status }) => {
		const { id: goalId } = params
		const result = db
			.prepare(`DELETE FROM goal WHERE id = ? AND user_id = ?`)
			.run(goalId, user.id)
		if (result.changes) {
			forgetItem("goal", goalId)
		}
		return result.changes
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
		db.prepare(
			`INSERT INTO goal_payment (id, goal_id, amount, date, note, transaction_id) VALUES (?, ?, ?, ?, ?, ?)`
		).run(
			randomUUID(),
			goalId,
			toCents(payload.amount),
			payload.date,
			payload.note?.trim() || null,
			payload.transactionId ?? null
		)
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
			.prepare(`DELETE FROM goal_payment WHERE id = ? AND goal_id = ?`)
			.run(pid, goalId)
		return result.changes
			? { goal: viewGoal(userId, goalId) }
			: status(404, { error: "Not found" })
	},
	{ params: goalPidParam }
)
