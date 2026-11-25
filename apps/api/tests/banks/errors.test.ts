import assert from "node:assert/strict"
import { test } from "node:test"
import {
	bankErrorForClient,
	redactBankErrorMessage,
} from "../../src/banks/errors.ts"

test("redactBankErrorMessage strips call log and fill values", () => {
	const raw = [
		'locator.fill("hunter2") failed',
		"Call log:",
		'  - fill("hunter2")',
		"  - waiting for locator",
	].join("\n")
	const redacted = redactBankErrorMessage(raw, { password: "hunter2" })
	assert.ok(!/hunter2/.test(redacted))
	assert.ok(!/call log:/i.test(redacted))
})

test("bankErrorForClient returns generic text for Playwright errors", () => {
	const error = new Error(
		'Timeout 20000ms exceeded.\nCall log:\n  - fill("x")'
	)
	const client = bankErrorForClient(error, "sync")
	assert.equal(client, "Could not read your accounts. Try connecting again.")
})

test("bankErrorForClient keeps short scraper messages", () => {
	const message = "Timed out waiting for EasyWeb to respond."
	assert.equal(bankErrorForClient(message, "login"), message)
})
