import assert from "node:assert/strict"
import { test } from "node:test"
import { trustProxyHops } from "../../src/config/env.ts"

test("trustProxyHops", () => {
	assert.equal(trustProxyHops.parse(undefined), 0)
	assert.equal(trustProxyHops.parse("false"), 0)
	assert.equal(trustProxyHops.parse("true"), 1)
	assert.equal(trustProxyHops.parse("2"), 2)
	assert.throws(() => trustProxyHops.parse("nope"))
	assert.throws(() => trustProxyHops.parse("-1"))
})
