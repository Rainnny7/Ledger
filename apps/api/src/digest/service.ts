/**
 * The monthly spending digest: gathers a user's transactions, computes the figures, asks the AI for
 * wording, and emails the result. Used by the hourly scheduler task and the "send me a test" button.
 */
import { and, eq, notLike } from "drizzle-orm"
import { aiChatAvailable } from "../auth/index.ts"
import { accountCurrencyById } from "../chat/tools.ts"
import { loadChatTransactions } from "../chat/transaction-load.ts"
import { env } from "../config/env.ts"
import { db } from "../db/connection.ts"
import { user } from "../db/schema/index.ts"
import {
	computeSpendingDigest,
	type DigestTransaction,
	digestPeriodFor,
	monthEnd,
	type SpendingDigest,
} from "../finance/spending-digest.ts"
import { convert, getRates } from "../fx/rates.ts"
import { getSmtpConfig, isSmtpConfigured, sendMail } from "../mail/smtp.ts"
import { spendingDigestMailContent } from "../mail/spending-digest.ts"
import { todayIso } from "../time/today.ts"
import { type DigestProse, generateDigestProse } from "./prose.ts"
import { digestUnsubscribeUrl } from "./unsubscribe.ts"

/** Whether this server can send digests at all: outgoing mail is set up and the AI gateway is usable. */
export function spendingDigestAvailable(): boolean {
	return isSmtpConfigured() && aiChatAvailable()
}

/** The user's transactions up to the end of `period`, converted to `currency`; pending and unconvertible ones are left out. */
async function loadDigestTransactions(
	userId: string,
	period: string,
	currency: string
): Promise<DigestTransaction[]> {
	const accountCurrencies = accountCurrencyById(userId)
	const fx = await getRates()
	const { transactions } = loadChatTransactions(userId, {
		until: monthEnd(period),
		limit: 200_000,
	})
	const digestTransactions: DigestTransaction[] = []
	for (const transaction of transactions) {
		if (transaction.pending) {
			continue
		}
		const converted = convert(
			transaction.amount,
			accountCurrencies.get(transaction.accountId) ?? currency,
			currency,
			fx
		)
		if (converted === null) {
			continue
		}
		digestTransactions.push({
			date: transaction.date,
			amount: converted,
			merchant: transaction.merchant,
			merchantKey: transaction.merchantKey,
			category: transaction.category,
		})
	}
	return digestTransactions
}

/** The result of one {@link sendSpendingDigest} call. */
export type DigestSendResult =
	| { status: "sent"; period: string; withProse: boolean }
	| { status: "skipped"; period: string; reason: string }

/**
 * Builds and emails one user's digest for the month that just ended.
 *
 * Unless `force` is set, the user must have the digest on and not have had this month's already; the
 * "already sent" marker is only written after the mail was accepted, so a failed send is retried.
 * `force` (the test button) ignores both the preference and the marker and never writes the marker.
 * Throws when mail can't be sent.
 */
export async function sendSpendingDigest(
	userId: string,
	options: { force: boolean }
): Promise<DigestSendResult> {
	const row = db.select().from(user).where(eq(user.id, userId)).get()
	const period = digestPeriodFor(todayIso())
	if (!row) {
		return { status: "skipped", period, reason: "no such user" }
	}
	if (
		!options.force &&
		(row.spendingDigest !== "monthly" ||
			row.spendingDigestLastPeriod === period)
	) {
		return { status: "skipped", period, reason: "not due" }
	}
	const currency =
		row.currency ?? [...accountCurrencyById(userId).values()][0] ?? "CAD"
	const digest = computeSpendingDigest(
		await loadDigestTransactions(userId, period, currency),
		period,
		currency
	)
	if (digest.spent === 0 && digest.income === 0) {
		if (!options.force) {
			// Nothing to say; remember that so the check doesn't redo this every hour.
			markSent(userId, period)
		}
		return { status: "skipped", period, reason: "no transactions" }
	}

	let prose: DigestProse = {}
	try {
		prose = await generateDigestProse(digest)
	} catch (error) {
		console.warn(
			`[digest] AI wording failed for ${userId}; sending the figures only:`,
			error instanceof Error ? error.message : error
		)
	}
	await sendDigestMail(row.email, userId, digest, prose)
	if (!options.force) {
		markSent(userId, period)
	}
	return { status: "sent", period, withProse: Object.keys(prose).length > 0 }
}

function markSent(userId: string, period: string) {
	db.update(user)
		.set({ spendingDigestLastPeriod: period })
		.where(eq(user.id, userId))
		.run()
}

async function sendDigestMail(
	to: string,
	userId: string,
	digest: SpendingDigest,
	prose: DigestProse
) {
	const unsubscribeUrl = digestUnsubscribeUrl(userId)
	const { subject, text, html } = spendingDigestMailContent({
		digest,
		prose,
		unsubscribeUrl,
		appUrl: env.PUBLIC_URL,
	})
	const fromAddress = getSmtpConfig().fromAddress
	// RFC 2369 / RFC 8058: the mailto form is only offered when there is an address to receive it.
	const unsubscribeTargets = [
		`<${unsubscribeUrl}>`,
		...(fromAddress ? [`<mailto:${fromAddress}?subject=unsubscribe>`] : []),
	]
	await sendMail({
		to,
		subject,
		text,
		html,
		headers: {
			"List-Unsubscribe": unsubscribeTargets.join(", "),
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		},
	})
}

/** Scheduler task body: sends this month's digest to every opted-in user who hasn't had it yet. */
export async function runSpendingDigestTask(): Promise<string> {
	if (!spendingDigestAvailable()) {
		return "Not set up: needs outgoing email and AI"
	}
	const recipients = db
		.select({ id: user.id, banned: user.banned })
		.from(user)
		.where(
			and(
				eq(user.spendingDigest, "monthly"),
				notLike(user.id, "ledger-demo%")
			)
		)
		.all()
		.filter((recipient) => !recipient.banned)
	let sent = 0
	let failed = 0
	let skipped = 0
	for (const recipient of recipients) {
		try {
			const result = await sendSpendingDigest(recipient.id, {
				force: false,
			})
			if (result.status === "sent") {
				sent++
			} else {
				skipped++
			}
		} catch (error) {
			failed++
			console.warn(
				`[digest] could not send to ${recipient.id}:`,
				error instanceof Error ? error.message : error
			)
		}
	}
	const parts = [`Sent ${sent} of ${recipients.length}`]
	if (skipped) {
		parts.push(`${skipped} not due`)
	}
	if (failed) {
		parts.push(`${failed} failed`)
	}
	return parts.join(" · ")
}
