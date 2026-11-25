import assert from "node:assert/strict"
import { test } from "node:test"
import { invoiceTotals, nextInvoiceNumber, payState } from "./invoices.ts"

test("totals: adds items, takes the discount off, then taxes the rest", () => {
  const t = invoiceTotals({
    items: [
      { description: "Design", quantity: 3, unitPrice: 100 },
      { description: "Hosting", quantity: 1, unitPrice: 20.5 },
    ],
    discount: 20.5,
    taxRate: 13,
  })
  assert.deepEqual(t, { subtotal: 320.5, discount: 20.5, tax: 39, total: 339 })
})

test("totals: a discount never goes past the subtotal", () => {
  assert.equal(
    invoiceTotals({
      items: [{ description: "x", quantity: 1, unitPrice: 10 }],
      discount: 50,
      taxRate: 5,
    }).total,
    0
  )
})

test("totals: rounds each line to cents", () => {
  assert.equal(
    invoiceTotals({
      items: [{ description: "x", quantity: 1.333, unitPrice: 30 }],
      discount: 0,
      taxRate: 0,
    }).subtotal,
    39.99
  )
})

test("payState: unpaid, partial, paid", () => {
  assert.equal(payState(100, 0), "unpaid")
  assert.equal(payState(100, 40), "partial")
  assert.equal(payState(100, 100), "paid")
  assert.equal(payState(100, 120), "paid")
})

test("nextInvoiceNumber: continues the highest number with the same prefix", () => {
  assert.equal(
    nextInvoiceNumber(["INV-0001", "INV-0009", "INV-0003", "Q-0050"]),
    "INV-0010"
  )
})

test("nextInvoiceNumber: starts at 0001 and keeps existing padding", () => {
  assert.equal(nextInvoiceNumber([]), "INV-0001")
  assert.equal(nextInvoiceNumber(["2026-004"], "2026-"), "2026-005")
})
