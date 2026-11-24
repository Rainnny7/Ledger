/**
 * Pure helpers that turn PayPal Transaction Search rows into Ledger transactions.
 *
 * Descriptions deliberately avoid the word "PayPal" so the categoriser sees the real
 * counterparty ("Spotify", "Steam") instead of filing everything under PayPal.
 */
import type { ScrapedTransaction } from '../types.ts'

interface Money {
  currency_code: string
  value: string
}

export interface PaypalTxDetail {
  transaction_info: {
    transaction_id: string
    transaction_event_code?: string
    transaction_initiation_date?: string
    transaction_updated_date?: string
    transaction_amount?: Money
    fee_amount?: Money
    transaction_status?: string
    transaction_subject?: string
    transaction_note?: string
    ending_balance?: Money
  }
  payer_info?: {
    email_address?: string
    payer_name?: { given_name?: string; surname?: string; alternate_full_name?: string }
  }
  cart_info?: { item_details?: { item_name?: string }[] }
}

/** Event-code families (first three characters) that don't move money, or only shadow another row. */
const SKIP_FAMILIES = new Set([
  'T13', // authorizations: a hold, settled later by the real payment
  'T15', // dispute holds and their releases
  'T98', // display only
])

/** Labels for event families whose rows don't name a counterparty. */
function familyLabel(family: string, amount: number): string | null {
  switch (family) {
    case 'T01':
      return 'Payment processing fee'
    case 'T02':
      return 'Currency conversion'
    case 'T03':
    case 'T07':
    case 'T16':
      return amount >= 0 ? 'Transfer in from bank/card' : 'Transfer out to bank/card'
    case 'T04':
    case 'T06':
    case 'T17':
    case 'T18':
      return amount < 0 ? 'Transfer out to bank' : 'Transfer in from bank'
    case 'T08':
    case 'T09':
      return 'Rewards & incentives'
    case 'T11':
      return 'Reversal'
    case 'T12':
    case 'T19':
      return 'Account adjustment'
    case 'T14':
      return 'Interest'
    case 'T20':
    case 'T22':
      return amount < 0 ? 'Transfer out to account' : 'Transfer in from account'
    case 'T21':
      return 'Reserve hold'
    default:
      return null
  }
}

const money = (m?: Money) => (m ? Number(m.value) : 0)
const clean = (s?: string) => (s ?? '').replace(/\s+/g, ' ').replace(/\bpay\s*pal\b\s*\*?/gi, '').trim()

function counterparty(d: PaypalTxDetail): string | null {
  const n = d.payer_info?.payer_name
  const name = clean(n?.alternate_full_name) || clean([n?.given_name, n?.surname].filter(Boolean).join(' '))
  if (name) return name
  const item = clean(d.cart_info?.item_details?.find((i) => i.item_name)?.item_name)
  if (item) return item
  const subject = clean(d.transaction_info.transaction_subject)
  if (subject) return subject
  const email = d.payer_info?.email_address
  return email ? email.split('@')[0] : null
}

/** One Ledger transaction for a PayPal row, or null when it shouldn't be counted. */
export function toTransaction(d: PaypalTxDetail): (ScrapedTransaction & { currency: string }) | null {
  const t = d.transaction_info
  const family = (t.transaction_event_code ?? '').slice(0, 3)
  if (SKIP_FAMILIES.has(family)) return null
  // D = denied, never happened.
  if (t.transaction_status === 'D') return null
  const date = (t.transaction_initiation_date ?? t.transaction_updated_date ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !t.transaction_amount) return null

  // What actually left / reached the balance: gross plus the (negative) fee.
  const amount = Math.round((money(t.transaction_amount) + money(t.fee_amount)) * 100) / 100
  if (amount === 0) return null

  const label = familyLabel(family, amount)
  const who = label ? null : counterparty(d)
  const description = label ?? who ?? (amount < 0 ? 'Payment sent' : 'Payment received')
  return {
    date,
    description,
    amount,
    runningBalance: t.ending_balance ? money(t.ending_balance) : null,
    pending: t.transaction_status === 'P',
    externalId: t.transaction_id,
    currency: t.transaction_amount.currency_code,
  }
}

/** Split a date range into the ≤31-day windows Transaction Search accepts. */
export function windows(from: Date, to: Date, days = 31): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = []
  let start = from
  while (start < to) {
    const end = new Date(Math.min(start.getTime() + days * 86_400_000 - 1000, to.getTime()))
    out.push({ start, end })
    start = new Date(end.getTime() + 1000)
  }
  return out
}
