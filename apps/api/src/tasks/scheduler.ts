/**
 * Background tasks: jobs that run on a timer (and from Admin → Tasks on demand).
 *
 * One scheduler tick a minute checks which tasks are due. A task never runs twice at once, and
 * its last run (when, how long, what happened) is kept in app_setting so it survives restarts.
 */
import { mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
import path from "node:path"
import {
	and,
	asc,
	eq,
	isNotNull,
	isNull,
	like,
	lt,
	notLike,
	sql,
} from "drizzle-orm"
import { db, getSetting, setSetting } from "../db/connection.ts"
import {
	appSetting,
	bankConnection,
	session,
	verification,
} from "../db/schema/index.ts"
import { env } from "../config/env.ts"
import { syncInBackground } from "../banks/sessions.ts"
import { refreshRates } from "../fx/rates.ts"
import { runSpendingDigestTask } from "../digest/service.ts"

/** Shape of TaskRun as stored and returned by the API. */
export interface TaskRun {
	startedAt: string
	finishedAt: string | null
	durationMs: number | null
	status: "running" | "ok" | "error"
	/** One line on what it did: "Refreshed 2 of 3 connections". */
	summary: string | null
	trigger: "schedule" | "manual"
}

/** Who started a run by hand, and why (both optional). */
export interface RunContext {
	trigger: TaskRun["trigger"]
	by?: string
	note?: string
}

interface Task {
	id: string
	label: string
	description: string
	intervalMs: number
	run: (context: RunContext) => Promise<string>
}

const HOUR = 60 * 60 * 1000

/** A connection someone synced (or the task refreshed) more recently than this is left alone. */
const FRESH_FOR_MS = 4 * HOUR

const needsSignInKey = (id: string) => `bg_needs_sign_in:${id}`

async function refreshBanks(): Promise<string> {
	const rows = db
		.select({
			id: bankConnection.id,
			lastSyncedAt: bankConnection.lastSyncedAt,
		})
		.from(bankConnection)
		.where(
			and(
				isNotNull(bankConnection.credentialsEnc),
				isNull(bankConnection.lastError),
				notLike(bankConnection.userId, "ledger-demo%")
			)
		)
		.orderBy(asc(bankConnection.lastSyncedAt))
		.all()

	const counts = {
		synced: 0,
		fresh: 0,
		waiting: 0,
		needsSignIn: 0,
		failed: 0,
		skipped: 0,
	}
	for (const row of rows) {
		const synced = row.lastSyncedAt
			? Date.parse(`${row.lastSyncedAt.replace(" ", "T")}Z`)
			: 0
		if (Date.now() - synced < FRESH_FOR_MS) {
			counts.fresh++
			continue
		}
		// The bank wanted a code last time. Trying again would only prompt the user's phone, so wait
		// until they've logged in themselves (which moves last_synced_at on).
		if (getSetting(needsSignInKey(row.id)) === (row.lastSyncedAt ?? "")) {
			counts.waiting++
			continue
		}
		// One at a time: each holds a whole browser open.
		const { result, message } = await syncInBackground(row.id)
		if (result === "needs-sign-in") {
			setSetting(needsSignInKey(row.id), row.lastSyncedAt ?? "")
			counts.needsSignIn++
		} else if (result === "synced") {
			counts.synced++
		} else if (result === "failed") {
			counts.failed++
		} else {
			counts.skipped++
		}
		if (message) {
			console.log(
				`[tasks] bank refresh ${row.id}: ${result} (${message})`
			)
		}
	}
	db.delete(appSetting)
		.where(
			and(
				like(appSetting.key, "bg_needs_sign_in:%"),
				sql`substr(${appSetting.key}, 18) NOT IN (SELECT ${bankConnection.id} FROM ${bankConnection})`
			)
		)
		.run()

	if (rows.length === 0) {
		return "No connections with saved login details"
	}
	const parts = [`Refreshed ${counts.synced} of ${rows.length}`]
	if (counts.fresh) {
		parts.push(`${counts.fresh} already up to date`)
	}
	if (counts.needsSignIn + counts.waiting) {
		parts.push(
			`${counts.needsSignIn + counts.waiting} need a two-factor login`
		)
	}
	if (counts.failed) {
		parts.push(`${counts.failed} failed`)
	}
	if (counts.skipped) {
		parts.push(`${counts.skipped} skipped`)
	}
	return parts.join(" · ")
}

async function tidyUp(): Promise<string> {
	const now = new Date().toISOString()
	// Better Auth stores dates as ISO strings; expired sessions and codes are never used again.
	const sessions = db
		.delete(session)
		.where(lt(session.expiresAt, now))
		.returning({ id: session.id })
		.all().length
	const codes = db
		.delete(verification)
		.where(lt(verification.expiresAt, now))
		.returning({ id: verification.id })
		.all().length
	return `Removed ${Number(sessions)} expired session${sessions === 1 ? "" : "s"} and ${Number(codes)} expired code${codes === 1 ? "" : "s"}`
}

/** Directory where scheduled backups are written. */
export const BACKUP_DIR = path.join(env.DATA_DIR, "backups")

/**
 * Why a copy was made: the daily schedule, "Run now" on the backup task, or the Back up now
 * button (which can carry a note, like "Before upgrading"). Kept beside the file in app_setting.
 */
export interface BackupReason {
	kind: "schedule" | "task" | "manual"
	by?: string
	note?: string
}

const reasonKey = (name: string) => `backup_reason:${name}`

function backupReason(name: string): BackupReason | null {
	const raw = getSetting(reasonKey(name))
	if (!raw) {
		return null
	}
	try {
		return JSON.parse(raw) as BackupReason
	} catch {
		return null
	}
}

/** Backups on disk, newest first. */
export function listBackups() {
	try {
		return readdirSync(BACKUP_DIR)
			.filter((file) =>
				/^ledger-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/.test(file)
			)
			.map((name) => {
				const st = statSync(path.join(BACKUP_DIR, name))
				return {
					name,
					size: st.size,
					createdAt: st.mtime.toISOString(),
					/** Null for copies made before reasons were recorded. */
					reason: backupReason(name),
				}
			})
			.toSorted((left, right) => right.name.localeCompare(left.name))
	} catch {
		return []
	}
}

/**
 * A consistent copy of the whole database (VACUUM INTO is safe while the app is writing). Saved
 * bank details stay encrypted in it, so restoring needs the same APP_SECRET / data/.secret.
 */
async function backUp(context: RunContext): Promise<string> {
	mkdirSync(BACKUP_DIR, { recursive: true })
	const name = `ledger-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.db`
	const file = path.join(BACKUP_DIR, name)
	// Recorded before the copy so the copy itself knows why it was made too.
	const reason: BackupReason =
		context.trigger === "schedule"
			? { kind: "schedule" }
			: {
					kind: context.note === undefined ? "task" : "manual",
					by: context.by,
					note: context.note || undefined,
				}
	setSetting(reasonKey(name), JSON.stringify(reason))
	// Drizzle has no builder for VACUUM INTO; a bound raw statement is the supported way.
	db.run(sql`VACUUM INTO ${file}`)
	const old = listBackups().slice(Math.max(1, env.BACKUPS_KEPT))
	for (const backup of old) {
		rmSync(path.join(BACKUP_DIR, backup.name), { force: true })
		db.delete(appSetting)
			.where(eq(appSetting.key, reasonKey(backup.name)))
			.run()
	}
	const mb = (statSync(file).size / 1024 / 1024).toFixed(1)
	return `Saved ${name} (${mb} MB)${old.length ? ` · removed ${old.length} older` : ""}`
}

const TASKS: Task[] = [
	{
		id: "bank-refresh",
		label: "Refresh bank accounts",
		description:
			"Signs in with saved details and reads what’s new, one connection at a time. Skips anything synced in the last 4 hours, connections showing an error, and banks waiting on a two-factor code.",
		intervalMs: 6 * HOUR,
		run: refreshBanks,
	},
	{
		id: "fx-rates",
		label: "Update exchange rates",
		description:
			"Fetches live mid-market exchange rates (from Coinbase) used to show amounts in each person’s own currency. If those can’t be reached it uses the European Central Bank’s daily reference rates instead, and if both fail the last good rates stay in use.",
		intervalMs: HOUR,
		run: refreshRates,
	},
	{
		id: "backup",
		label: "Back up database",
		description:
			"Saves a copy of the whole database to data/backups, keeping the most recent 14 (BACKUPS_KEPT). Download one from Admin → Tasks. Restoring needs the same APP_SECRET, since saved bank details stay encrypted.",
		intervalMs: 24 * HOUR,
		run: backUp,
	},
	{
		id: "spending-digest",
		label: "Send spending digests",
		description:
			"Emails the monthly spending digest to people who turned it on, once their local date moves into a new month. Each month is sent at most once per person, and nothing is sent unless outgoing email and AI are set up.",
		intervalMs: HOUR,
		run: runSpendingDigestTask,
	},
	{
		id: "tidy-up",
		label: "Tidy up",
		description: "Removes expired login sessions and one-time codes.",
		intervalMs: 24 * HOUR,
		run: tidyUp,
	},
]

const running = new Set<string>()
const stateKey = (id: string) => `task:${id}`

function lastRun(id: string): TaskRun | null {
	const raw = getSetting(stateKey(id))
	if (!raw) {
		return null
	}
	try {
		return JSON.parse(raw) as TaskRun
	} catch {
		return null
	}
}

/** Scheduled background tasks and their last run metadata. */
export function listTasks() {
	return TASKS.map((task) => {
		const last = lastRun(task.id)
		const base = last?.finishedAt ?? last?.startedAt
		return {
			id: task.id,
			label: task.label,
			description: task.description,
			intervalMs: task.intervalMs,
			running: running.has(task.id),
			lastRun: last,
			nextRunAt: base
				? new Date(Date.parse(base) + task.intervalMs).toISOString()
				: null,
		}
	})
}

/**
 * When the background refresh will next pick up a connection, or null when it won't on its own (no
 * saved login, an error to fix, or the bank waiting on a two-factor code).
 */
export function nextAutoSyncAt(c: {
	id: string
	lastSyncedAt: string | null
	savedCredentials: boolean
	lastError: string | null
}) {
	if (!c.savedCredentials || c.lastError || waitingOnSignIn(c)) {
		return null
	}
	const task = TASKS.find((candidate) => candidate.id === "bank-refresh")!
	const last = lastRun(task.id)
	const base = last
		? Date.parse(last.finishedAt ?? last.startedAt)
		: Date.now()
	let next = Math.max(Date.now(), base + task.intervalMs)
	// A run skips anything synced in the last few hours, so it's the first run after that window.
	const synced = c.lastSyncedAt
		? Date.parse(`${c.lastSyncedAt.replace(" ", "T")}Z`)
		: 0
	while (next - synced < FRESH_FOR_MS) {
		next += task.intervalMs
	}
	return new Date(next).toISOString()
}

/** The background refresh hit a two-factor prompt and is holding off until the user signs in themselves. */
export function waitingOnSignIn(c: {
	id: string
	lastSyncedAt: string | null
	savedCredentials: boolean
	lastError: string | null
}) {
	return (
		c.savedCredentials &&
		!c.lastError &&
		getSetting(needsSignInKey(c.id)) === (c.lastSyncedAt ?? "")
	)
}

/** Whether a scheduled task id is registered. */
export const hasTask = (id: string) =>
	TASKS.some((candidate) => candidate.id === id)

/**
 * Starts a task unless it's already running (then it's null). Resolves with how the run went once
 * it finishes.
 */
export async function runTask(
	id: string,
	trigger: TaskRun["trigger"],
	extra: Omit<RunContext, "trigger"> = {}
): Promise<TaskRun | null> {
	const task = TASKS.find((candidate) => candidate.id === id)
	if (!task || running.has(id)) {
		return null
	}
	running.add(id)
	const started = Date.now()
	const startedAt = new Date(started).toISOString()
	const save = (patch: Partial<TaskRun>) => {
		const run: TaskRun = {
			startedAt,
			finishedAt: null,
			durationMs: null,
			status: "running",
			summary: null,
			trigger,
			...patch,
		}
		setSetting(stateKey(id), JSON.stringify(run))
		return run
	}
	let result = save({})
	console.log(`[tasks] ${task.label}: started (${trigger})`)
	try {
		const summary = await task.run({ trigger, ...extra })
		result = save({
			status: "ok",
			summary,
			finishedAt: new Date().toISOString(),
			durationMs: Date.now() - started,
		})
		console.log(`[tasks] ${task.label}: ${summary}`)
	} catch (error) {
		const summary = (error as Error).message || "Failed"
		result = save({
			status: "error",
			summary,
			finishedAt: new Date().toISOString(),
			durationMs: Date.now() - started,
		})
		console.error(`[tasks] ${task.label} failed:`, error)
	} finally {
		running.delete(id)
	}
	return result
}

let timer: NodeJS.Timeout | null = null

function scheduleTick() {
	for (const task of TASKS) {
		const last = lastRun(task.id)
		const base = last ? Date.parse(last.finishedAt ?? last.startedAt) : 0
		if (Date.now() - base >= task.intervalMs) {
			void runTask(task.id, "schedule")
		}
	}
}

/** Checks once a minute for due tasks; the first check waits a couple of minutes after start-up. */
export function startScheduler() {
	if (timer) {
		return
	}
	// A run cut short by a restart shows as interrupted instead of running forever.
	for (const task of TASKS) {
		const last = lastRun(task.id)
		if (last?.status === "running") {
			setSetting(
				stateKey(task.id),
				JSON.stringify({
					...last,
					status: "error",
					summary: "Interrupted by a restart",
				})
			)
		}
	}
	setTimeout(() => {
		scheduleTick()
		timer = setInterval(scheduleTick, 60_000)
		timer.unref()
	}, 2 * 60_000).unref()
}
