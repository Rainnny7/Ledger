import assert from "node:assert/strict"
import { test } from "node:test"
import { classify } from "../../finance/categorize.ts"
import { type PaypalTxDetail, toTransaction, windows } from "./parse.ts"

const row = (
  info: Partial<PaypalTxDetail["transaction_info"]>,
  extra: Partial<PaypalTxDetail> = {}
): PaypalTxDetail => ({
  transaction_info: {
    transaction_id: "TX1",
    transaction_initiation_date: "2026-03-04T18:22:10+0000",
    transaction_status: "S",
    ...info,
  },
  ...extra,
})

test("paypal: a purchase is named after the merchant, net of fees", () => {
  const t = toTransaction(
    row(
      {
        transaction_event_code: "T0006",
        transaction_amount: { currency_code: "CAD", value: "-11.99" },
        ending_balance: { currency_code: "CAD", value: "4.01" },
      },
      { payer_info: { payer_name: { alternate_full_name: "Spotify AB" } } }
    )
  )
  assert.deepEqual(t, {
    date: "2026-03-04",
    description: "Spotify AB",
    amount: -11.99,
    runningBalance: 4.01,
    pending: false,
    externalId: "TX1",
    currency: "CAD",
  })
  assert.equal(classify(t!.description, t!.amount).merchant, "Spotify")
})

test("paypal: money received keeps the fee PayPal took", () => {
  const t = toTransaction(
    row({
      transaction_event_code: "T0000",
      transaction_amount: { currency_code: "USD", value: "50.00" },
      fee_amount: { currency_code: "USD", value: "-1.75" },
      transaction_subject: "Concert tickets",
    })
  )
  assert.equal(t?.amount, 48.25)
  assert.equal(t?.currency, "USD")
  assert.equal(t?.description, "Concert tickets")
})

test("paypal: funding and withdrawals are transfers, never spending", () => {
  const fund = toTransaction(
    row({
      transaction_event_code: "T0700",
      transaction_amount: { currency_code: "CAD", value: "11.99" },
    })
  )
  const out = toTransaction(
    row({
      transaction_event_code: "T0400",
      transaction_amount: { currency_code: "CAD", value: "-200.00" },
    })
  )
  const fx = toTransaction(
    row({
      transaction_event_code: "T0200",
      transaction_amount: { currency_code: "CAD", value: "-13.40" },
    })
  )
  for (const t of [fund, out, fx]) {
    assert.notEqual(t, null)
    assert.doesNotMatch(t!.description, /paypal/i)
    assert.equal(classify(t!.description, t!.amount).category, "transfers")
  }
})

test("paypal: authorizations, holds and denied payments are skipped; pending is flagged", () => {
  const amt = { currency_code: "CAD", value: "-5.00" }
  assert.equal(
    toTransaction(
      row({ transaction_event_code: "T1300", transaction_amount: amt })
    ),
    null
  )
  assert.equal(
    toTransaction(
      row({ transaction_event_code: "T1500", transaction_amount: amt })
    ),
    null
  )
  assert.equal(
    toTransaction(
      row({
        transaction_event_code: "T0006",
        transaction_status: "D",
        transaction_amount: amt,
      })
    ),
    null
  )
  assert.equal(
    toTransaction(
      row({
        transaction_event_code: "T0006",
        transaction_status: "P",
        transaction_amount: amt,
      })
    )?.pending,
    true
  )
})

test('paypal: strips "PayPal" out of counterparty names', () => {
  const t = toTransaction(
    row(
      {
        transaction_event_code: "T0006",
        transaction_amount: { currency_code: "CAD", value: "-3" },
      },
      {
        cart_info: { item_details: [{ item_name: "PAYPAL *STEAM GAMES" }] },
      }
    )
  )
  assert.equal(t?.description, "STEAM GAMES")
})

test("paypal: date windows never exceed 31 days and cover the range", () => {
  const from = new Date("2025-01-01T00:00:00Z")
  const to = new Date("2025-04-15T00:00:00Z")
  const w = windows(from, to)
  assert.deepEqual(w[0].start, from)
  assert.deepEqual(w[w.length - 1].end, to)
  for (const x of w)
    assert.ok(x.end.getTime() - x.start.getTime() < 31 * 86_400_000)
})
