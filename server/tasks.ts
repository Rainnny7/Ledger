/**
 * Background tasks: jobs that run on a timer (and from Admin → Tasks on demand).
 *
 * One scheduler tick a minute checks which tasks are due. A task never runs twice at once, and
 * its last run (when, how long, what happened) is kept in app_setting so it survives restarts.
 */
import { db, getSetting, setSetting } from './db.ts'
import { DEMO_USER_ID } from './demo.ts'
import { syncInBackground } from './banks/sessions.ts'
import { refreshRates } from './fx.ts'

export interface TaskRun {
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: 'running' | 'ok' | 'error'
  /** One line on what it did: "Refreshed 2 of 3 connections". */
  summary: string | null
  trigger: 'schedule' | 'manual'
}

interface Task {
  id: string
  label: string
  description: string
  intervalMs: number
  run: () => Promise<string>
}

const HOUR = 60 * 60 * 1000

/** A connection someone synced (or the task refreshed) more recently than this is left alone. */
const FRESH_FOR_MS = 4 * HOUR

const needsSignInKey = (id: string) => `bg_needs_sign_in:${id}`

async function refreshBanks(): Promise<string> {
  const rows = db
    .prepare(
      `SELECT id, last_synced_at AS lastSyncedAt FROM bank_connection
        WHERE credentials_enc IS NOT NULL AND last_error IS NULL AND user_id != ?
        ORDER BY last_synced_at`,
    )
    .all(DEMO_USER_ID) as { id: string; lastSyncedAt: string | null }[]

  const counts = { synced: 0, fresh: 0, waiting: 0, needsSignIn: 0, failed: 0, skipped: 0 }
  for (const row of rows) {
    const synced = row.lastSyncedAt ? Date.parse(`${row.lastSyncedAt.replace(' ', 'T')}Z`) : 0
    if (Date.now() - synced < FRESH_FOR_MS) {
      counts.fresh++
      continue
    }
    // The bank wanted a code last time. Trying again would only prompt the user's phone, so wait
    // until they've signed in themselves (which moves last_synced_at on).
    if (getSetting(needsSignInKey(row.id)) === (row.lastSyncedAt ?? '')) {
      counts.waiting++
      continue
    }
    // One at a time: each holds a whole browser open.
    const { result, message } = await syncInBackground(row.id)
    if (result === 'needs-sign-in') {
      setSetting(needsSignInKey(row.id), row.lastSyncedAt ?? '')
      counts.needsSignIn++
    } else if (result === 'synced') counts.synced++
    else if (result === 'failed') counts.failed++
    else counts.skipped++
    if (message) console.log(`[tasks] bank refresh ${row.id}: ${result} (${message})`)
  }
  db.prepare(`DELETE FROM app_setting WHERE key LIKE 'bg_needs_sign_in:%' AND substr(key, 18) NOT IN (SELECT id FROM bank_connection)`).run()

  if (rows.length === 0) return 'No connections with saved sign-in details'
  const parts = [`Refreshed ${counts.synced} of ${rows.length}`]
  if (counts.fresh) parts.push(`${counts.fresh} already up to date`)
  if (counts.needsSignIn + counts.waiting) parts.push(`${counts.needsSignIn + counts.waiting} need a two-factor sign-in`)
  if (counts.failed) parts.push(`${counts.failed} failed`)
  if (counts.skipped) parts.push(`${counts.skipped} skipped`)
  return parts.join(' · ')
}

async function tidyUp(): Promise<string> {
  const now = new Date().toISOString()
  // Better Auth stores dates as ISO strings; expired sessions and codes are never used again.
  const sessions = db.prepare(`DELETE FROM session WHERE expiresAt < ?`).run(now).changes
  const codes = db.prepare(`DELETE FROM verification WHERE expiresAt < ?`).run(now).changes
  return `Removed ${Number(sessions)} expired session${sessions === 1 ? '' : 's'} and ${Number(codes)} expired code${codes === 1 ? '' : 's'}`
}

const TASKS: Task[] = [
  {
    id: 'bank-refresh',
    label: 'Refresh bank accounts',
    description:
      'Signs in with saved details and reads what’s new, one connection at a time. Skips anything synced in the last 4 hours, connections showing an error, and banks waiting on a two-factor code.',
    intervalMs: 6 * HOUR,
    run: refreshBanks,
  },
  {
    id: 'fx-rates',
    label: 'Update exchange rates',
    description:
      'Fetches live mid-market exchange rates (from Coinbase) used to show amounts in each person’s own currency. If those can’t be reached it uses the European Central Bank’s daily reference rates instead, and if both fail the last good rates stay in use.',
    intervalMs: HOUR,
    run: refreshRates,
  },
  {
    id: 'tidy-up',
    label: 'Tidy up',
    description: 'Removes expired sign-in sessions and one-time codes.',
    intervalMs: 24 * HOUR,
    run: tidyUp,
  },
]

const running = new Set<string>()
const stateKey = (id: string) => `task:${id}`

function lastRun(id: string): TaskRun | null {
  const raw = getSetting(stateKey(id))
  if (!raw) return null
  try {
    return JSON.parse(raw) as TaskRun
  } catch {
    return null
  }
}

export function listTasks() {
  return TASKS.map((t) => {
    const last = lastRun(t.id)
    const base = last?.finishedAt ?? last?.startedAt
    return {
      id: t.id,
      label: t.label,
      description: t.description,
      intervalMs: t.intervalMs,
      running: running.has(t.id),
      lastRun: last,
      nextRunAt: base ? new Date(Date.parse(base) + t.intervalMs).toISOString() : null,
    }
  })
}

/**
 * When the background refresh will next pick up a connection, or null when it won't on its own (no
 * saved sign-in, an error to fix, or the bank waiting on a two-factor code).
 */
export function nextAutoSyncAt(c: { id: string; lastSyncedAt: string | null; savedCredentials: boolean; lastError: string | null }) {
  if (!c.savedCredentials || c.lastError) return null
  if (getSetting(needsSignInKey(c.id)) === (c.lastSyncedAt ?? '')) return null
  const task = TASKS.find((t) => t.id === 'bank-refresh')!
  const last = lastRun(task.id)
  const base = last ? Date.parse(last.finishedAt ?? last.startedAt) : Date.now()
  let next = Math.max(Date.now(), base + task.intervalMs)
  // A run skips anything synced in the last few hours, so it's the first run after that window.
  const synced = c.lastSyncedAt ? Date.parse(`${c.lastSyncedAt.replace(' ', 'T')}Z`) : 0
  while (next - synced < FRESH_FOR_MS) next += task.intervalMs
  return new Date(next).toISOString()
}

export const hasTask = (id: string) => TASKS.some((t) => t.id === id)

/** Starts a task unless it's already running. Resolves when it finishes. */
export async function runTask(id: string, trigger: TaskRun['trigger']): Promise<boolean> {
  const task = TASKS.find((t) => t.id === id)
  if (!task || running.has(id)) return false
  running.add(id)
  const started = Date.now()
  const startedAt = new Date(started).toISOString()
  const save = (r: Partial<TaskRun>) =>
    setSetting(stateKey(id), JSON.stringify({ startedAt, finishedAt: null, durationMs: null, status: 'running', summary: null, trigger, ...r }))
  save({})
  console.log(`[tasks] ${task.label}: started (${trigger})`)
  try {
    const summary = await task.run()
    save({ status: 'ok', summary, finishedAt: new Date().toISOString(), durationMs: Date.now() - started })
    console.log(`[tasks] ${task.label}: ${summary}`)
  } catch (err) {
    const summary = (err as Error).message || 'Failed'
    save({ status: 'error', summary, finishedAt: new Date().toISOString(), durationMs: Date.now() - started })
    console.error(`[tasks] ${task.label} failed:`, err)
  } finally {
    running.delete(id)
  }
  return true
}

let timer: NodeJS.Timeout | null = null

/** Checks once a minute for due tasks; the first check waits a couple of minutes after start-up. */
export function startScheduler() {
  if (timer) return
  // A run cut short by a restart shows as interrupted instead of running forever.
  for (const t of TASKS) {
    const last = lastRun(t.id)
    if (last?.status === 'running') {
      setSetting(stateKey(t.id), JSON.stringify({ ...last, status: 'error', summary: 'Interrupted by a restart' }))
    }
  }
  const tick = () => {
    for (const t of TASKS) {
      const last = lastRun(t.id)
      const base = last ? Date.parse(last.finishedAt ?? last.startedAt) : 0
      if (Date.now() - base >= t.intervalMs) void runTask(t.id, 'schedule')
    }
  }
  setTimeout(() => {
    tick()
    timer = setInterval(tick, 60_000)
    timer.unref()
  }, 2 * 60_000).unref()
}
