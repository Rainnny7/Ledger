/**
 * Demo mode swaps every bank/finance request for a made-up dataset (the server's demo user), so the
 * app can be shown off without real balances on screen. It's a per-browser switch; toggling it
 * reloads so nothing from the other mode lingers in memory.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'ledger:demo'
const PREFS_KEY = 'ledger:demo-prefs'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const demoMode = read()

/** Shown when something would be saved in demo mode. Forms still open so the app can be explored. */
export const DEMO_READ_ONLY = 'Demo mode is read-only. Exit demo mode to make changes.'

/** The made-up person shown instead of the signed-in user while in demo mode. */
export const DEMO_IDENTITY = { name: 'Alex Morgan', email: 'alex.morgan@example.com' }

/**
 * Preferences changed while in demo mode. They stay in this browser only (never saved to the
 * account) and are thrown away when demo mode is turned on or off.
 */
export interface DemoPrefs {
  currency?: string
  includeOverdraft?: boolean
}

function readPrefs(): DemoPrefs {
  if (!demoMode) return {}
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as DemoPrefs
  } catch {
    return {}
  }
}

let prefs = readPrefs()
const listeners = new Set<() => void>()

export function setDemoPrefs(patch: DemoPrefs) {
  prefs = { ...prefs, ...patch }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage blocked: the change still applies until the page reloads.
  }
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The demo-mode preference overrides (empty outside demo mode). */
export const useDemoPrefs = () => useSyncExternalStore(subscribe, () => prefs)

export function setDemoMode(on: boolean) {
  try {
    localStorage.removeItem(PREFS_KEY)
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: nothing to persist, and the reload below keeps the current mode.
  }
  // A full reload drops everything cached from the other mode.
  window.location.assign('/')
}
