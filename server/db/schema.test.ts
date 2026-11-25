import assert from "node:assert/strict"
import { Database } from "bun:sqlite"
import { test } from "node:test"
import { type Conn, createSchema, MONEY_TABLES } from "./schema.ts"

function open() {
	const raw = new Database(":memory:")
	raw.run("PRAGMA foreign_keys = ON")
	const conn: Conn = {
		exec: (sql) => raw.run(sql),
		prepare: (sql) => raw.query(sql) as ReturnType<Conn["prepare"]>,
	}
	return conn
}

/** The schema as it was before cents: the real DDL with each money column back to a REAL. */
function oldSchema(conn: Conn) {
	conn.exec("CREATE TABLE user (id TEXT PRIMARY KEY)")
	conn.exec(`CREATE TABLE bank_connection (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
    institution TEXT NOT NULL, label TEXT NOT NULL, username_masked TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active')`)
	for (const table of MONEY_TABLES) {
		const ddl = table
			.ddl(table.name)
			.replace(
				/CHECK \(typeof\(\w+\) IN \([^)]*\)( AND \w+ >= -?\d+)?\)/g,
				""
			)
			.replace(
				/(\w+) INTEGER( NOT NULL)?( DEFAULT 0)?/g,
				(m, col: string) =>
					table.columns.includes(col)
						? m.replace("INTEGER", "REAL")
						: m
			)
		conn.exec(ddl)
	}
	conn.exec(
		"CREATE INDEX idx_tx_account_date ON bank_transaction(account_id, date DESC)"
	)
	conn.exec(
		"CREATE INDEX idx_goal_payment_goal ON goal_payment(goal_id, date)"
	)
	conn.exec(
		"CREATE UNIQUE INDEX idx_work_payment_external ON work_payment(external_id) WHERE external_id IS NOT NULL"
	)
}

function seedOld(conn: Conn) {
	const run = (sql: string, ...p: (string | number | null)[]) =>
		conn.prepare(sql).run(...p)
	run("INSERT INTO user (id) VALUES ('u')")
	run(
		"INSERT INTO bank_connection (id, user_id, institution, label, username_masked) VALUES ('c','u','td','TD','x1')"
	)
	run(
		`INSERT INTO bank_account (id, connection_id, external_key, name, type, balance, available, credit_limit)
     VALUES ('a','c','k','Chequing','chequing', 1234.56, 1200.1, NULL)`
	)
	run(
		`INSERT INTO bank_transaction (id, account_id, fingerprint, date, description, amount, running_balance)
     VALUES ('t1','a','f1','2026-01-01','Coffee', -4.35, 1234.56), ('t2','a','f2','2026-01-02','Pay', 0.1 + 0.2, NULL)`
	)
	run(
		"INSERT INTO goal (id, user_id, name, target) VALUES ('g','u','Trip', 2500.5)"
	)
	run(
		"INSERT INTO goal_payment (id, goal_id, amount, date, transaction_id) VALUES ('gp','g', 19.99,'2026-01-03','t1')"
	)
	run(
		"INSERT INTO work_job (id, user_id, name, rate, pay_amount) VALUES ('j','u','Job', 25.5, 250)"
	)
	run(
		"INSERT INTO work_invoice (id, job_id, date, hours, rate, total) VALUES ('wi','j','2026-01-04', 7.5, 25.5, 191.25)"
	)
	run(
		"INSERT INTO work_payment (id, invoice_id, amount, date, external_id, received_amount) VALUES ('wp','wi', -10.05,'2026-01-05','cap1', 13.57)"
	)
	run(
		`INSERT INTO invoice (id, user_id, number, token, issue_date, from_json, client_json, items_json, discount)
     VALUES ('i','u','1','tok','2026-01-06','{}','{}', '[{"description":"A","quantity":2,"unitPrice":19.99}]', 5.5)`
	)
	run(
		"INSERT INTO invoice_payment (id, invoice_id, amount, date) VALUES ('ip','i', 0.07,'2026-01-07')"
	)
}

const one = (conn: Conn, sql: string) =>
	conn.prepare(sql).get() as Record<string, unknown>

test("migrates REAL dollars to INTEGER cents and keeps rows, links and indexes", () => {
	const conn = open()
	oldSchema(conn)
	seedOld(conn)
	createSchema(conn)

	assert.deepEqual(
		{
			...one(
				conn,
				"SELECT balance, available, credit_limit FROM bank_account"
			),
		},
		{ balance: 123_456, available: 120_010, credit_limit: null }
	)
	assert.deepEqual(
		conn
			.prepare(
				"SELECT amount, running_balance FROM bank_transaction ORDER BY id"
			)
			.all()
			.map((row) => ({ ...(row as object) })),
		[
			{ amount: -435, running_balance: 123_456 },
			{ amount: 30, running_balance: null },
		]
	)
	assert.equal(one(conn, "SELECT target FROM goal").target, 250_050)
	assert.equal(one(conn, "SELECT amount FROM goal_payment").amount, 1999)
	assert.deepEqual(
		{ ...one(conn, "SELECT rate, pay_amount FROM work_job") },
		{ rate: 2550, pay_amount: 25_000 }
	)
	assert.deepEqual(
		{ ...one(conn, "SELECT hours, rate, total FROM work_invoice") },
		{ hours: 7.5, rate: 2550, total: 19_125 }
	)
	assert.deepEqual(
		{ ...one(conn, "SELECT amount, received_amount FROM work_payment") },
		{ amount: -1005, received_amount: 1357 }
	)
	assert.equal(one(conn, "SELECT discount FROM invoice").discount, 550)
	assert.equal(one(conn, "SELECT amount FROM invoice_payment").amount, 7)

	// Every stored money value is a true integer.
	for (const table of MONEY_TABLES) {
		for (const column of table.columns) {
			assert.equal(
				one(
					conn,
					`SELECT COUNT(*) AS n FROM ${table.name} WHERE ${column} IS NOT NULL AND typeof(${column}) != 'integer'`
				).n,
				0,
				`${table.name}.${column}`
			)
		}
	}
	const cols = conn.prepare("PRAGMA table_info(bank_transaction)").all() as {
		name: string
		type: string
	}[]
	assert.equal(
		cols.find((column) => column.name === "amount")?.type,
		"INTEGER"
	)

	// Line items move to cents too.
	const items = JSON.parse(
		String(one(conn, "SELECT items_json FROM invoice").items_json)
	)
	assert.deepEqual(items, [
		{ description: "A", quantity: 2, unitPriceCents: 1999 },
	])

	// Child rows and links survived the rebuild, and indexes were recreated.
	assert.equal(
		one(conn, "SELECT transaction_id FROM goal_payment").transaction_id,
		"t1"
	)
	assert.equal(conn.prepare("PRAGMA foreign_key_check").all().length, 0)
	const indexes = (
		conn
			.prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
			.all() as {
			name: string
		}[]
	).map((i) => i.name)
	for (const name of [
		"idx_tx_account_date",
		"idx_goal_payment_goal",
		"idx_work_payment_external",
		"idx_invoice_user",
	]) {
		assert.ok(indexes.includes(name), name)
	}
})

test("is idempotent: a second run leaves cents alone", () => {
	const conn = open()
	oldSchema(conn)
	seedOld(conn)
	createSchema(conn)
	createSchema(conn)
	assert.equal(one(conn, "SELECT balance FROM bank_account").balance, 123_456)
	assert.equal(one(conn, "SELECT discount FROM invoice").discount, 550)
})

test("a fresh database refuses stray decimals and broken invariants", () => {
	const conn = open()
	conn.exec("CREATE TABLE user (id TEXT PRIMARY KEY)")
	createSchema(conn)
	conn.prepare("INSERT INTO user (id) VALUES ('u')").run()
	const budget = conn.prepare(
		"INSERT INTO budget (user_id, category, amount, currency) VALUES ('u', ?, ?, 'CAD')"
	)
	budget.run("food", 50_000)
	assert.throws(() => budget.run("fun", 12.5))
	assert.throws(() => budget.run("rent", -1))
})
