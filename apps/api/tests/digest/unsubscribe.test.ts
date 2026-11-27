import assert from "node:assert/strict"
import { before, test } from "node:test"
import { eq } from "drizzle-orm"
import { db, runMigrations, setSetting } from "../../src/db/connection.ts"
import { user } from "../../src/db/schema/index.ts"
import {
	digestUnsubscribeUrl,
	unsubscribeFromDigest,
} from "../../src/digest/unsubscribe.ts"
import { getSmtpConfig, saveSmtpConfig } from "../../src/mail/smtp.ts"

const USER_ID = "00000000-0000-4000-8000-0000000000e7"

before(() => {
	runMigrations()
	const now = new Date().toISOString()
	db.insert(user)
		.values({
			id: USER_ID,
			name: "Digest",
			email: "digest@example.com",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
			spendingDigest: "monthly",
		})
		.onConflictDoNothing()
		.run()
})

const tokenOf = (url: string) => new URL(url).searchParams.get("token")!

test("a signed link turns the digest off for that user only", () => {
	db.update(user).set({ spendingDigest: "monthly" }).run()
	assert.equal(
		unsubscribeFromDigest(tokenOf(digestUnsubscribeUrl(USER_ID))),
		true
	)
	const rows = db.select().from(user).where(eq(user.id, USER_ID)).all()
	assert.equal(rows[0]?.spendingDigest, "off")
})

test("a forged or unknown-user token changes nothing", () => {
	db.update(user).set({ spendingDigest: "monthly" }).run()
	assert.equal(unsubscribeFromDigest("bogus.token"), false)
	assert.equal(
		unsubscribeFromDigest(tokenOf(digestUnsubscribeUrl("nobody"))),
		false
	)
	const rows = db.select().from(user).where(eq(user.id, USER_ID)).all()
	assert.equal(rows[0]?.spendingDigest, "monthly")
})

test("DKIM key is stored encrypted, kept on blank, and cleared with the domain", () => {
	setSetting("smtp_config", "")
	const base = {
		host: "smtp.example.com",
		port: 587,
		secure: false,
		username: "",
		password: "pw",
		fromAddress: "ledger@example.com",
		fromName: "Ledger",
	}
	const key = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
	saveSmtpConfig({
		...base,
		dkimDomainName: "example.com",
		dkimKeySelector: "ledger",
		dkimPrivateKey: key,
	})
	const saved = getSmtpConfig()
	assert.equal(saved.dkimDomainName, "example.com")
	assert.equal(saved.dkimPrivateKeySet, true)
	assert.equal(JSON.stringify(saved).includes("abc"), false)

	saveSmtpConfig({
		...base,
		dkimDomainName: "example.com",
		dkimKeySelector: "ledger",
	})
	assert.equal(getSmtpConfig().dkimPrivateKeySet, true)

	saveSmtpConfig({ ...base, dkimDomainName: "" })
	const cleared = getSmtpConfig()
	assert.equal(cleared.dkimDomainName, "")
	assert.equal(cleared.dkimPrivateKeySet, false)
	setSetting("smtp_config", "")
})
