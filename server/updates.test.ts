import assert from "node:assert/strict"
import { test } from "node:test"
import { semverNewer } from "./updates.ts"

test("semverNewer ignores a leading v", () => {
  assert.equal(semverNewer("v0.2.0", "0.1.0"), true)
  assert.equal(semverNewer("0.1.0", "v0.1.0"), false)
})

test("semverNewer compares patch, minor, and major", () => {
  assert.equal(semverNewer("0.1.1", "0.1.0"), true)
  assert.equal(semverNewer("0.2.0", "0.1.9"), true)
  assert.equal(semverNewer("1.0.0", "0.99.99"), true)
  assert.equal(semverNewer("0.1.0", "0.1.0"), false)
  assert.equal(semverNewer("0.0.9", "0.1.0"), false)
})
