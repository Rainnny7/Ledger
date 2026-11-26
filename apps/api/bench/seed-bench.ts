import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { toCents } from "@ledger/shared/money"
const DESCRIPTIONS = [
	"LOBLAWS #1123",
	"METRO 457",
	"NETFLIX.COM",
	"SPOTIFY",
	"TD VISA PAYMENT",
	"MONTHLY PLAN FEE",
	"HYDRO ONE NETWORKS",
	"TIM HORTONS 331",
	"AMAZON.CA",
	"UBER TRIP",
] as const

export type BenchScale = 1_000 | 20_000 | 100_000

/** Point DATA_DIR at a temp folder, migrate, and seed one user's data at the given transaction count. */
export async function prepareBenchDatabase(transactionCount: BenchScale) {
	process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "ledger-bench-"))
	const { db, runMigrations } = await import("../src/db/connection.ts")
	const {
		bankAccount,
		bankConnection,
		bankTransaction,
		budget,
		goal,
		goalPayment,
		subscription,
		user,
	} = await import("../src/db/schema/index.ts")

	runMigrations()
	const userId = "bench-user"
	const now = new Date().toISOString()
	db.insert(user)
		.values({
			id: userId,
			name: "Bench User",
			email: `bench-${transactionCount}@example.com`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		})
		.run()
	db.insert(bankConnection)
		.values({
			id: "bench-conn",
			userId,
			institution: "demo",
			label: "Bench",
			usernameMasked: "••••",
		})
		.run()
	const accountIds = ["bench-chq", "bench-visa", "bench-sav"] as const
	for (const [index, accountId] of accountIds.entries()) {
		db.insert(bankAccount)
			.values({
				id: accountId,
				connectionId: "bench-conn",
				externalKey: `k${index}`,
				name: `Account ${index + 1}`,
				type:
					index === 1
						? "credit"
						: index === 2
							? "savings"
							: "chequing",
				currency: "CAD",
				balance: toCents(2500),
				available: toCents(2500),
			})
			.run()
	}
	db.insert(budget)
		.values([
			{ userId, category: "food", amount: toCents(450), currency: "CAD" },
			{
				userId,
				category: "subscriptions",
				amount: toCents(120),
				currency: "CAD",
			},
			{
				userId,
				category: "transport",
				amount: toCents(30),
				currency: "CAD",
			},
		])
		.run()
	db.insert(subscription)
		.values([
			{
				id: "sub-netflix",
				userId,
				name: "Netflix",
				amount: toCents(18.99),
				currency: "CAD",
				cycle: "monthly",
				anchorDate: "2026-01-15",
				category: "subscriptions",
			},
			{
				id: "sub-spotify",
				userId,
				name: "Spotify",
				amount: toCents(11.99),
				currency: "CAD",
				cycle: "monthly",
				anchorDate: "2026-01-08",
				category: "subscriptions",
			},
		])
		.run()
	db.insert(goal)
		.values({
			id: "bench-goal",
			userId,
			name: "Emergency fund",
			target: toCents(5_000),
			currency: "CAD",
		})
		.run()
	const { todayIso } = await import("../src/time/today.ts")
	const today = todayIso()
	db.insert(goalPayment)
		.values({
			id: "bench-goal-pay",
			goalId: "bench-goal",
			amount: toCents(750),
			date: today,
		})
		.run()

	const endMs = Date.parse(`${today}T12:00:00Z`)
	const startMs = endMs - 729 * 86_400_000
	const batch: {
		id: string
		accountId: string
		fingerprint: string
		date: string
		description: string
		amount: number
		pending: boolean
	}[] = []
	for (let index = 0; index < transactionCount; index += 1) {
		const dayOffset = index % 730
		const date = new Date(startMs + dayOffset * 86_400_000)
		const iso = date.toISOString().slice(0, 10)
		const description = DESCRIPTIONS[index % DESCRIPTIONS.length]
		const isIncome = index % 17 === 0
		const amount = toCents(
			isIncome ? 1800 + (index % 5) * 100 : -(4.5 + (index % 90) * 3.17)
		)
		batch.push({
			id: `tx-${index}`,
			accountId: accountIds[index % accountIds.length],
			fingerprint: `fp-${index}`,
			date: iso,
			description,
			amount,
			pending: false,
		})
		if (batch.length >= 500) {
			db.insert(bankTransaction).values(batch).run()
			batch.length = 0
		}
	}
	if (batch.length > 0) {
		db.insert(bankTransaction).values(batch).run()
	}

	return { userId, transactionCount, db, cleanup: () => {} }
}
