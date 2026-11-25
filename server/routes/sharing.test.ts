import assert from "node:assert/strict"
import { before, test } from "node:test"
import { mock } from "bun:test"
import { Elysia } from "elysia"

const { db, migrateAppTables } = await import("../db/connection.ts")

// Sign-in is Better Auth's job; here the x-user header stands in for the session cookie.
mock.module("../auth/index.ts", () => ({
	auth: {
		api: {
			getSession: async ({ headers }: { headers: Headers }) => {
				const user = db
					.prepare(`SELECT id, name, email FROM user WHERE id = ?`)
					.get(headers.get("x-user") ?? "")
				return user ? { user } : null
			},
		},
	},
}))
const { sharing } = await import("./sharing.ts")
const { work } = await import("./work.ts")
const { finance } = await import("./finance/index.ts")
const { access } = await import("../sharing/access.ts")

const app = new Elysia().use(sharing).use(work).use(finance)

const call = (user: string, method: string, url: string, body?: unknown) =>
	app.handle(
		new Request(`http://localhost${url}`, {
			method,
			headers: { "x-user": user, "content-type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		})
	)

const json = async (response: Response) => (await response.json()) as any

const OWNER = "owner"
const EDITOR = "editor"
const STRANGER = "stranger"

before(() => {
	db.exec(
		`CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, name TEXT, email TEXT NOT NULL)`
	)
	migrateAppTables()
	for (const id of [OWNER, EDITOR, STRANGER]) {
		db.prepare(
			`INSERT OR IGNORE INTO user (id, name, email) VALUES (?, ?, ?)`
		).run(id, id, `${id}@example.com`)
	}
	db.exec(`
    INSERT INTO goal (id, user_id, name, target) VALUES ('00000000-0000-4000-8000-000000000001', 'owner', 'Trip', 1000);
    INSERT INTO goal_payment (id, goal_id, amount, date) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 50, '2026-01-01');
    INSERT INTO work_job (id, user_id, name, rate) VALUES ('00000000-0000-4000-8000-000000000003', 'owner', 'Job', 20);
    INSERT INTO work_entry (id, job_id, date, hours) VALUES ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', '2026-01-01', 2);
    INSERT INTO work_invoice (id, job_id, date, hours, rate, total) VALUES ('00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', '2026-01-02', 2, 20, 40);
    INSERT INTO work_payment (id, invoice_id, amount, date) VALUES ('00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000005', 10, '2026-01-03');
    INSERT INTO bank_connection (id, user_id, institution, label, username_masked) VALUES ('c-o', 'owner', 'x', 'x', 'x'), ('c-e', 'editor', 'x', 'x', 'x');
    INSERT INTO bank_account (id, connection_id, external_key, name, type) VALUES ('a-o', 'c-o', 'k', 'n', 'chequing'), ('a-e', 'c-e', 'k', 'n', 'chequing');
    INSERT INTO bank_transaction (id, account_id, fingerprint, date, description, amount) VALUES ('00000000-0000-4000-8000-000000000007', 'a-o', 'f', '2026-01-03', 'd', 10), ('00000000-0000-4000-8000-000000000008', 'a-e', 'f', '2026-01-03', 'd', 10);
  `)
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
	const count = db
		.prepare(`SELECT count(*) AS n FROM share WHERE kind = 'goal'`)
		.get() as { n: number }
	assert.equal(count.n, 1)
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
	const left = db
		.prepare(
			`SELECT (SELECT count(*) FROM work_entry) + (SELECT count(*) FROM work_payment) + (SELECT count(*) FROM work_invoice) AS n`
		)
		.get() as { n: number }
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
	const goal = await call(
		EDITOR,
		"POST",
		"/goals/00000000-0000-4000-8000-000000000001/payments",
		{
			amount: 5,
			date: "2026-02-01",
			transactionId: "00000000-0000-4000-8000-000000000008",
		}
	)
	assert.equal(goal.status, 403)
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
