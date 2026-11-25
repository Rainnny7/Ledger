import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? 'data')
mkdirSync(DATA_DIR, { recursive: true })

/**
 * A secret used both for Better Auth session signing and for encrypting
 * saved bank credentials. If it isn't provided via env we generate one once
 * and keep it in the data directory so restarts don't log everyone out.
 */
function loadSecret(): string {
  if (process.env.APP_SECRET) return process.env.APP_SECRET
  const file = path.join(DATA_DIR, '.secret')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const secret = randomBytes(32).toString('base64url')
  writeFileSync(file, secret, { mode: 0o600 })
  return secret
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  /**
   * The address other people reach Ledger on: invoice share links, PayPal's return page and its
   * webhooks. Defaults to APP_URL. PayPal only delivers webhooks to a public https:// address.
   */
  publicUrl: (process.env.PUBLIC_URL ?? process.env.APP_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  secret: loadSecret(),
  /** Set TD_HEADLESS=false to watch the browser while it logs into EasyWeb. */
  tdHeadless: process.env.TD_HEADLESS !== 'false',
  /** New accounts can only be created while there are none, unless ALLOW_REGISTRATION=true. */
  allowRegistration: process.env.ALLOW_REGISTRATION === 'true',
  /** Behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel…), trust its X-Forwarded-For for the client's address. */
  trustProxy: process.env.TRUST_PROXY === 'true',
  /** Live exchange rates (Coinbase's public rates by default). Set FX_LIVE_URL= (empty) to use only the ECB's daily rates. */
  fxLiveUrl: process.env.FX_LIVE_URL ?? 'https://api.coinbase.com/v2/exchange-rates?currency=USD',
  /** The fallback when live rates fail: Frankfurter's daily ECB reference rates. */
  fxRatesUrl: process.env.FX_RATES_URL ?? 'https://api.frankfurter.dev/v1/latest',
}
