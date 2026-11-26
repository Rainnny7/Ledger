import path from "node:path"
import { type BenchScale, prepareBenchDatabase } from "./seed-bench.ts"

const SCALES: BenchScale[] = [1_000, 20_000, 100_000]
const RUNS = 5
const scaleArg = Number(Bun.argv[2])

if (!scaleArg) {
	const script = path.join(import.meta.dir, "tools.bench.ts")
	const lines: string[] = [
		"scale\ttool\tp50_ms\tp95_ms\trows\tbytes\t~tokens",
	]
	for (const scale of SCALES) {
		const process = Bun.spawnSync(["bun", "run", script, String(scale)], {
			cwd: path.join(import.meta.dir, ".."),
			stdout: "pipe",
		})
		const output = process.stdout.toString().trim()
		if (output) {
			lines.push(output)
		}
	}
	console.log(lines.join("\n"))
	process.exit(0)
}

const scale = scaleArg as BenchScale

type BenchCase = {
	name: string
	run: (userId: string) => unknown
}

const { userId } = await prepareBenchDatabase(scale)
const { clearChatTransactionCaches } =
	await import("../src/chat/transaction-load.ts")
const {
	financialOverviewForUser,
	getBudgetsForUser,
	getGoalsForUser,
	getSubscriptionsForUser,
	listAccountsForUser,
	searchTransactionsForUser,
	spendingSummaryForUser,
} = await import("../src/chat/tools.ts")

const CASES: BenchCase[] = [
	{
		name: "listAccounts",
		run: (benchUserId) => listAccountsForUser(benchUserId),
	},
	{
		name: "searchTransactions",
		run: (benchUserId) =>
			searchTransactionsForUser(benchUserId, {
				limit: 50,
				category: "food",
				from: "2024-06-01",
				until: "2025-06-01",
			}),
	},
	{
		name: "spendingSummary",
		run: (benchUserId) =>
			spendingSummaryForUser(benchUserId, {
				from: "2024-01-01",
				until: "2025-12-31",
				groupBy: "category",
			}),
	},
	{
		name: "getBudgets",
		run: (benchUserId) => getBudgetsForUser(benchUserId),
	},
	{
		name: "getSubscriptions",
		run: (benchUserId) => getSubscriptionsForUser(benchUserId),
	},
	{ name: "getGoals", run: (benchUserId) => getGoalsForUser(benchUserId) },
	{
		name: "financialOverview",
		run: (benchUserId) => financialOverviewForUser(benchUserId),
	},
]

function percentile(sorted: number[], fraction: number): number {
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * fraction) - 1)
	)
	return sorted[index]
}

function jsonBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).length
}

for (const benchCase of CASES) {
	const durations: number[] = []
	let lastPayload: unknown
	let lastRowsScanned = "-"
	for (let run = 0; run < RUNS; run += 1) {
		clearChatTransactionCaches(userId)
		const started = performance.now()
		lastPayload = benchCase.run(userId)
		durations.push(performance.now() - started)
	}
	if (benchCase.name === "searchTransactions") {
		lastRowsScanned = "50"
	} else if (benchCase.name === "spendingSummary") {
		lastRowsScanned = String(scale)
	}
	durations.sort((left, right) => left - right)
	const bytes = jsonBytes(lastPayload)
	const p50 = Math.round(percentile(durations, 0.5) * 10) / 10
	const p95 = Math.round(percentile(durations, 0.95) * 10) / 10
	console.log(
		[
			scale,
			benchCase.name,
			p50,
			p95,
			lastRowsScanned,
			bytes,
			Math.ceil(bytes / 4),
		].join("\t")
	)
}
