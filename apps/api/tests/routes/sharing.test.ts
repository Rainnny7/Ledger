import assert from "node:assert/strict"
import { before, test } from "node:test"
import { mock } from "bun:test"
import { Elysia } from "elysia"

const { count, eq } = await import("drizzle-orm")
const { db, runMigrations } = await import("../../src/db/connection.ts")
const {
	bankAccount,
	bankConnection,
	bankTransaction,
	goal,
	goalPayment,
	share,
	user,
	workEntry,
	workInvoice,
	workJob,
	workPayment,
} = await import("../../src/db/schema/index.ts")

// Sign-in is Better Auth's job; here the x-user header stands in for the session cookie.
mock.module("../../src/auth/index.ts", () => ({
	auth: {
		api: {
			getSession: async ({ headers }: { headers: Headers }) => {
				const found = db
					.select({ id: user.id, name: user.name, email: user.email })
					.from(user)
					.where(eq(user.id, headers.get("x-user") ?? ""))
					.get()
				return found ? { user: found } : null
			},
		},
	},
}))
const { sharing } = await import("../../src/routes/sharing.ts")
const { work } = await import("../../src/routes/work.ts")
const { finance } = await import("../../src/routes/finance/index.ts")
const { access } = await import("../../src/sharing/access.ts")

const app = new Elysia().use(sharing).use(work).use(finance)

const call = (userId: string, method: string, url: string, body?: unknown) =>
	app.handle(
		new Request(`http://localhost${url}`, {
			method,
			headers: { "x-user": userId, "content-type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		})
	)

const json = async (response: Response) => (await response.json()) as any

const OWNER = "owner"
const EDITOR = "editor"
const STRANGER = "stranger"

before(() => {
	runMigrations()
	for (const id of [OWNER, EDITOR, STRANGER]) {
		const now = new Date().toISOString()
		db.insert(user)
			.values({
				id,
				name: id,
				email: `${id}@example.com`,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing()
			.run()
	}
	const jobId = "00000000-0000-4000-8000-000000000003"
	const invoiceId = "00000000-0000-4000-8000-000000000005"
	db.insert(goal)
		.values({
			id: "00000000-0000-4000-8000-000000000001",
			userId: "owner",
			name: "Trip",
			target: 1000,
		})
		.run()
	db.insert(goalPayment)
		.values({
			id: "00000000-0000-4000-8000-000000000002",
			goalId: "00000000-0000-4000-8000-000000000001",
			amount: 50,
			date: "2026-01-01",
		})
		.run()
	db.insert(workJob)
		.values({ id: jobId, userId: "owner", name: "Job", rate: 20 })
		.run()
	db.insert(workEntry)
		.values({
			id: "00000000-0000-4000-8000-000000000004",
			jobId,
			date: "2026-01-01",
			hours: 2,
		})
		.run()
	db.insert(workInvoice)
		.values({
			id: invoiceId,
			jobId,
			date: "2026-01-02",
			hours: 2,
			rate: 20,
			total: 40,
		})
		.run()
	db.insert(workPayment)
		.values({
			id: "00000000-0000-4000-8000-000000000006",
			invoiceId,
			amount: 10,
			date: "2026-01-03",
		})
		.run()
	db.insert(bankConnection)
		.values([
			{
				id: "c-o",
				userId: "owner",
				institution: "x",
				label: "x",
				usernameMasked: "x",
			},
			{
				id: "c-e",
				userId: "editor",
				institution: "x",
				label: "x",
				usernameMasked: "x",
			},
		])
		.run()
	db.insert(bankAccount)
		.values([
			{
				id: "a-o",
				connectionId: "c-o",
				externalKey: "k",
				name: "n",
				type: "chequing",
			},
			{
				id: "a-e",
				connectionId: "c-e",
				externalKey: "k",
				name: "n",
				type: "chequing",
			},
		])
		.run()
	db.insert(bankTransaction)
		.values([
			{
				id: "00000000-0000-4000-8000-000000000007",
				accountId: "a-o",
				fingerprint: "f",
				date: "2026-01-03",
				description: "d",
				amount: 10,
			},
			{
				id: "00000000-0000-4000-8000-000000000008",
				accountId: "a-e",
				fingerprint: "f",
				date: "2026-01-03",
				description: "d",
				amount: 10,
			},
		])
		.run()
})

const invite = (
	email: string,
	kind = "goal",
	itemId = "00000000-0000-4000-8000-000000000001"
) =>
	call(OWNER, "POST", `/shares/${kind}/${itemId}`, {
		email,
		permission: "edit",
	})

const pendingInvites = async () =>
	(await json(await call(EDITOR, "GET", "/invites"))).invites as {
		id: string
		kind: string
		name: string
		owner: { name: string; email: string }
	}[]

test("sharing with an unknown email answers like a known one", async () => {
	const known = await invite("editor@example.com")
	const unknown = await invite("nobody@example.com")
	assert.equal(known.status, 200)
	assert.equal(known.status, unknown.status)
	assert.deepEqual(await known.json(), await unknown.json())
	const shareCount = db
		.select({ n: count() })
		.from(share)
		.where(eq(share.kind, "goal"))
		.get()!
	assert.equal(shareCount.n, 1)
})

test("a pending share grants nothing until it is accepted", async () => {
	await invite(
		"editor@example.com",
		"job",
		"00000000-0000-4000-8000-000000000003"
	)
	assert.equal(
		access(EDITOR, "goal", "00000000-0000-4000-8000-000000000001"),
		null
	)
	assert.equal(
		access(EDITOR, "job", "00000000-0000-4000-8000-000000000003"),
		null
	)
	const jobs = await json(await call(EDITOR, "GET", "/work"))
	assert.deepEqual(jobs.jobs, [])
	assert.equal(
		(
			await call(
				EDITOR,
				"DELETE",
				"/goals/00000000-0000-4000-8000-000000000001/payments/00000000-0000-4000-8000-000000000002"
			)
		).status,
		404
	)

	const invites = await pendingInvites()
	assert.equal(invites.length, 2)
	assert.equal(invites[0]!.owner.email, "owner@example.com")
	// The owner sees it as pending.
	const { shares } = await json(
		await call(
			OWNER,
			"GET",
			"/shares/goal/00000000-0000-4000-8000-000000000001"
		)
	)
	assert.equal(shares[0].status, "pending")
})

test("only the recipient can accept or decline", async () => {
	const invites = await pendingInvites()
	const goalInvite = invites.find((i) => i.kind === "goal")!
	const jobInvite = invites.find((i) => i.kind === "job")!
	for (const who of [OWNER, STRANGER]) {
		for (const verb of ["accept", "decline"]) {
			assert.equal(
				(await call(who, "POST", `/invites/${goalInvite.id}/${verb}`))
					.status,
				404
			)
		}
	}
	assert.equal(
		access(EDITOR, "goal", "00000000-0000-4000-8000-000000000001"),
		null
	)

	assert.equal(
		(await call(EDITOR, "POST", `/invites/${goalInvite.id}/accept`)).status,
		200
	)
	assert.equal(
		access(EDITOR, "goal", "00000000-0000-4000-8000-000000000001")?.role,
		"edit"
	)

	assert.equal(
		(await call(EDITOR, "POST", `/invites/${jobInvite.id}/decline`)).status,
		200
	)
	assert.equal(
		access(EDITOR, "job", "00000000-0000-4000-8000-000000000003"),
		null
	)
	assert.deepEqual(await pendingInvites(), [])
})

test("an editor cannot delete the owner's goal payments", async () => {
	assert.equal(
		(
			await call(
				EDITOR,
				"DELETE",
				"/goals/00000000-0000-4000-8000-000000000001/payments/00000000-0000-4000-8000-000000000002"
			)
		).status,
		403
	)
	assert.equal(
		(
			await call(
				STRANGER,
				"DELETE",
				"/goals/00000000-0000-4000-8000-000000000001/payments/00000000-0000-4000-8000-000000000002"
			)
		).status,
		404
	)
})

test("an editor cannot delete work bills, shifts or payments", async () => {
	await invite(
		"editor@example.com",
		"job",
		"00000000-0000-4000-8000-000000000003"
	)
	const [pending] = await pendingInvites()
	await call(EDITOR, "POST", `/invites/${pending!.id}/accept`)
	assert.equal(
		access(EDITOR, "job", "00000000-0000-4000-8000-000000000003")?.role,
		"edit"
	)
	assert.equal(
		(
			await call(
				EDITOR,
				"DELETE",
				"/work/entries/00000000-0000-4000-8000-000000000004"
			)
		).status,
		403
	)
	assert.equal(
		(
			await call(
				EDITOR,
				"DELETE",
				"/work/payments/00000000-0000-4000-8000-000000000006"
			)
		).status,
		403
	)
	assert.equal(
		(
			await call(
				EDITOR,
				"DELETE",
				"/work/invoices/00000000-0000-4000-8000-000000000005"
			)
		).status,
		403
	)
	assert.equal(
		(
			await call(
				STRANGER,
				"DELETE",
				"/work/payments/00000000-0000-4000-8000-000000000006"
			)
		).status,
		404
	)
	const left = {
		n:
			db.select({ n: count() }).from(workEntry).get()!.n +
			db.select({ n: count() }).from(workPayment).get()!.n +
			db.select({ n: count() }).from(workInvoice).get()!.n,
	}
	assert.equal(left.n, 3)
})

test("an editor cannot link a bank transaction to the owner's records", async () => {
	const bill = await call(
		EDITOR,
		"POST",
		"/work/invoices/00000000-0000-4000-8000-000000000005/payments",
		{
			amount: 5,
			date: "2026-02-01",
			transactionId: "00000000-0000-4000-8000-000000000008",
		}
	)
	assert.equal(bill.status, 403)
	const goalAttempt = await call(
		EDITOR,
		"POST",
		"/goals/00000000-0000-4000-8000-000000000001/payments",
		{
			amount: 5,
			date: "2026-02-01",
			transactionId: "00000000-0000-4000-8000-000000000008",
		}
	)
	assert.equal(goalAttempt.status, 403)
	// Without a link, editors can still add payments.
	const plain = await call(
		EDITOR,
		"POST",
		"/goals/00000000-0000-4000-8000-000000000001/payments",
		{
			amount: 5,
			date: "2026-02-01",
		}
	)
	assert.equal(plain.status, 200)
})

test("the owner links their own transaction but not someone else's", async () => {
	const mine = await call(
		OWNER,
		"POST",
		"/work/invoices/00000000-0000-4000-8000-000000000005/payments",
		{
			amount: 5,
			date: "2026-02-01",
			transactionId: "00000000-0000-4000-8000-000000000007",
		}
	)
	assert.equal(mine.status, 200)
	const foreign = await call(
		OWNER,
		"POST",
		"/work/invoices/00000000-0000-4000-8000-000000000005/payments",
		{
			amount: 5,
			date: "2026-02-01",
			transactionId: "00000000-0000-4000-8000-000000000008",
		}
	)
	assert.equal(foreign.status, 400)
})

test("the owner can still delete", async () => {
	assert.equal(
		(
			await call(
				OWNER,
				"DELETE",
				"/work/payments/00000000-0000-4000-8000-000000000006"
			)
		).status,
		200
	)
	assert.equal(
		(
			await call(
				OWNER,
				"DELETE",
				"/goals/00000000-0000-4000-8000-000000000001/payments/00000000-0000-4000-8000-000000000002"
			)
		).status,
		200
	)
})
