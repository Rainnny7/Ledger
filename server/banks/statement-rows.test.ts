import assert from "node:assert/strict"
import { test } from "node:test"
import { validateStatementRow } from "./statement-rows.ts"

test("validateStatementRow accepts valid rows", () => {
  const row = validateStatementRow({
    date: "2024-06-01",
    description: "Grocery store",
    amount: -12.34,
    runningBalance: 100,
    pending: false,
  })
  assert.equal(row.ok, true)
  if (row.ok) assert.equal(row.row.amount, -12.34)
})

test("validateStatementRow rejects bad dates, amounts, and descriptions", () => {
  assert.equal(
    validateStatementRow({
      date: "2024-13-40",
      description: "x",
      amount: 1,
      runningBalance: null,
      pending: false,
    }).ok,
    false
  )
  assert.equal(
    validateStatementRow({
      date: "2024-06-01",
      description: "x",
      amount: 2e10,
      runningBalance: null,
      pending: false,
    }).ok,
    false
  )
  assert.equal(
    validateStatementRow({
      date: "2024-06-01",
      description: "",
      amount: 1,
      runningBalance: null,
      pending: false,
    }).ok,
    false
  )
})
