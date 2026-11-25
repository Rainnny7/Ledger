import assert from "node:assert/strict"
import { test } from "node:test"
import { nonEmpty, parsePositiveInt, parseTrustProxy } from "./env.ts"

test("nonEmpty treats blank strings as unset", () => {
  assert.equal(nonEmpty(undefined), undefined)
  assert.equal(nonEmpty(""), undefined)
  assert.equal(nonEmpty("  "), undefined)
  assert.equal(nonEmpty(" https://x.test "), "https://x.test")
})

test("parsePositiveInt accepts integers >= 1", () => {
  assert.equal(parsePositiveInt("3", 14, "BACKUPS_KEPT"), 3)
  assert.equal(parsePositiveInt(undefined, 14, "BACKUPS_KEPT"), 14)
})

test("parsePositiveInt rejects NaN and zero", () => {
  assert.throws(() => parsePositiveInt("abc", 14, "BACKUPS_KEPT"))
  assert.throws(() => parsePositiveInt("0", 14, "BACKUPS_KEPT"))
})

test("parseTrustProxy", () => {
  assert.equal(parseTrustProxy(undefined), 0)
  assert.equal(parseTrustProxy("false"), 0)
  assert.equal(parseTrustProxy("true"), 1)
  assert.equal(parseTrustProxy("2"), 2)
  assert.throws(() => parseTrustProxy("nope"))
})
