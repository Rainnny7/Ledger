import assert from "node:assert/strict"
import { test } from "node:test"
import { isInstanceOwnerFor } from "./owner-gate.ts"

test("only the recorded owner may manage backups", () => {
	assert.equal(isInstanceOwnerFor("owner-1", "owner-1"), true)
	assert.equal(isInstanceOwnerFor("other-admin", "owner-1"), false)
	assert.equal(isInstanceOwnerFor(null, "owner-1"), false)
})
