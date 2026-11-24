/**
 * Demo mode swaps every bank/finance request for a made-up dataset (the server's demo user), so the
 * app can be shown off without real balances on screen. It's a per-browser switch; toggling it
 * reloads so nothing from the other mode lingers in memory.
 */
const KEY = 'ledger:demo'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const demoMode = read()

/** The made-up person shown instead of the signed-in user while in demo mode. */
export const DEMO_IDENTITY = { name: 'Alex Morgan', email: 'alex.morgan@example.com' }

export function setDemoMode(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: nothing to persist, and the reload below keeps the current mode.
  }
  // A full reload drops everything cached from the other mode.
  window.location.assign('/')
}
