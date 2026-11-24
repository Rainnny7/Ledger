/**
 * PayPal through its REST API (no browser): the user creates a REST app on
 * developer.paypal.com with "Transaction Search" enabled and pastes its Client ID and Secret.
 *
 * - Balances: GET /v1/reporting/balances (one per currency held).
 * - History:  GET /v1/reporting/transactions, in ≤31-day windows, up to 3 years back.
 *   PayPal adds new activity to this feed with a delay of up to ~3 hours.
 */
import type { BankClient, LoginStep, ScrapedAccount, ScrapedTransaction } from '../types.ts'
import { type PaypalTxDetail, toTransaction, windows } from './parse.ts'

const SANDBOX = process.env.PAYPAL_ENV === 'sandbox'
const LIVE_API = 'https://api-m.paypal.com'
const SANDBOX_API = 'https://api-m.sandbox.paypal.com'
const API = SANDBOX ? SANDBOX_API : LIVE_API
const OTHER_API = SANDBOX ? LIVE_API : SANDBOX_API

const basicAuth = (clientId: string, secret: string) => `Basic ${Buffer.from(`${clientId.trim()}:${secret.trim()}`).toString('base64')}`

/** Whether that environment would hand out a token for these details (only used to explain a rejection). */
async function acceptedBy(api: string, clientId: string, secret: string) {
  try {
    const res = await fetch(`${api}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: basicAuth(clientId, secret), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok
  } catch {
    return false
  }
}
/** Transaction Search keeps three years of history. */
const MAX_HISTORY_DAYS = 3 * 365 - 2
const PAGE_SIZE = 500

interface BalancesResponse {
  balances?: {
    currency: string
    primary?: boolean
    total_balance?: { value: string }
    available_balance?: { value: string }
  }[]
  last_refresh_time?: string
}

interface TransactionsResponse {
  transaction_details?: PaypalTxDetail[]
  total_pages?: number
}

class PaypalError extends Error {}

export class PaypalClient implements BankClient {
  private token: string | null = null

  async open() {}

  async login(clientId: string, secret: string): Promise<LoginStep> {
    let res: Response
    try {
      res = await fetch(`${API}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: basicAuth(clientId, secret),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      return { type: 'error', message: 'Could not reach PayPal. Check your connection and try again.' }
    }
    if (res.status === 401 || res.status === 400) {
      // The usual mix-up: details copied from the Sandbox tab, which only works against PayPal's test site.
      if (await acceptedBy(OTHER_API, clientId, secret)) {
        return {
          type: 'error',
          message: SANDBOX
            ? 'Those are Live app details, but this server is set to PayPal’s sandbox (PAYPAL_ENV=sandbox). Remove that setting to use them.'
            : 'Those are Sandbox app details. The sandbox only has PayPal’s made-up test data, not your real account, so Ledger needs the Client ID and Secret from the Live tab of your app.',
        }
      }
      return { type: 'error', message: `PayPal rejected that Client ID / Secret. Make sure both come from the same ${SANDBOX ? 'Sandbox' : 'Live'} app.` }
    }
    if (!res.ok) return { type: 'error', message: `PayPal sign-in failed (HTTP ${res.status}).` }
    const body = (await res.json()) as { access_token?: string }
    if (!body.access_token) return { type: 'error', message: 'PayPal did not return an access token.' }
    this.token = body.access_token
    return { type: 'success' }
  }

  async chooseMfa(): Promise<LoginStep> {
    return { type: 'error', message: 'PayPal does not use 2-step verification here.' }
  }

  async submitCode(): Promise<LoginStep> {
    return this.chooseMfa()
  }

  async waitForApproval(): Promise<LoginStep> {
    return this.chooseMfa()
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = `${API}${path}?${new URLSearchParams(params)}`
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      })
      if (res.ok) return (await res.json()) as T
      // Rate limited or a blip on PayPal's side: back off and retry a couple of times.
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        continue
      }
      const detail = (await res.json().catch(() => null)) as { name?: string; message?: string } | null
      if (res.status === 403 || detail?.name === 'NOT_AUTHORIZED') {
        throw new PaypalError(
          'PayPal refused access to your transactions. In your app on developer.paypal.com, enable "Transaction Search" (it can take a few hours to apply), then reconnect.',
        )
      }
      throw new PaypalError(`PayPal returned an error (${detail?.message ?? `HTTP ${res.status}`}).`)
    }
  }

  async scrapeAccounts(
    onProgress?: (msg: string) => void,
    sinceFor: (externalKey: string) => string | null = () => null,
  ): Promise<ScrapedAccount[]> {
    if (!this.token) throw new PaypalError('Not signed in to PayPal.')
    onProgress?.('Reading your PayPal balances…')
    const bal = await this.get<BalancesResponse>('/v1/reporting/balances', { currency_code: 'ALL' })
    const balances = bal.balances ?? []

    // Read from the earliest date any balance still needs (incremental after the first sync).
    const now = new Date()
    const refreshed = bal.last_refresh_time ? new Date(bal.last_refresh_time) : now
    const to = refreshed < now ? refreshed : now
    const oldest = new Date(now.getTime() - MAX_HISTORY_DAYS * 86_400_000)
    const keys = balances.length ? balances.map((b) => `paypal:${b.currency}`) : ['paypal:CAD']
    const since = keys.map(sinceFor)
    const full = since.some((s) => s === null)
    let from = oldest
    if (!full) {
      const earliest = new Date(`${since.sort()[0]}T00:00:00Z`)
      if (earliest > oldest) from = earliest
    }

    const byCurrency = new Map<string, ScrapedTransaction[]>()
    const spans = windows(from, to)
    for (const [i, w] of spans.entries()) {
      onProgress?.(
        full
          ? `Reading PayPal history (${i + 1} of ${spans.length} months)…`
          : `Reading recent PayPal activity (${i + 1} of ${spans.length})…`,
      )
      for (let page = 1, pages = 1; page <= pages; page++) {
        const r = await this.get<TransactionsResponse>('/v1/reporting/transactions', {
          start_date: w.start.toISOString(),
          end_date: w.end.toISOString(),
          fields: 'transaction_info,payer_info,cart_info',
          page_size: String(PAGE_SIZE),
          page: String(page),
        })
        pages = r.total_pages ?? 1
        for (const d of r.transaction_details ?? []) {
          const t = toTransaction(d)
          if (!t) continue
          const { currency, ...tx } = t
          const list = byCurrency.get(currency) ?? []
          list.push(tx)
          byCurrency.set(currency, list)
        }
      }
    }

    const currencies = new Set([...balances.map((b) => b.currency), ...byCurrency.keys()])
    if (currencies.size === 0) currencies.add('CAD')
    const primary = balances.find((b) => b.primary)?.currency
    return [...currencies].map((currency) => {
      const b = balances.find((x) => x.currency === currency)
      const n = (v?: { value: string }) => (v ? Number(v.value) : null)
      return {
        externalKey: `paypal:${currency}`,
        name: currency === primary || currencies.size === 1 ? 'PayPal balance' : `PayPal ${currency} balance`,
        type: 'wallet',
        numberMasked: null,
        currency,
        balance: n(b?.total_balance) ?? 0,
        available: n(b?.available_balance),
        overdraftLimit: null,
        overdraftUsed: null,
        creditLimit: null,
        transactions: (byCurrency.get(currency) ?? []).sort((x, y) => (x.date < y.date ? 1 : -1)),
        historyFrom: full ? from.toISOString().slice(0, 10) : null,
        details: null,
      } satisfies ScrapedAccount
    })
  }

  async storageState() {
    return null
  }

  async close() {
    this.token = null
  }
}
