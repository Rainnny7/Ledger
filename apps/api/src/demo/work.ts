import { randomUUID } from "node:crypto"
import { db } from "../db/connection.ts"
import {
	workEntry,
	workInvoice,
	workJob,
	workPayment,
} from "../db/schema/index.ts"
import { mulCents, toCents, toCentsOrNull } from "@ledger/shared/money"
import { type Draft, toIsoDate } from "./util.ts"

/** A side job paid in weekly instalments: one bill cleared, one being paid off, one just sent, plus a few unbilled shifts. */
export function seedWork(today: Date, userId: string) {
	const ago = (days: number) =>
		toIsoDate(new Date(today.getTime() - days * 86_400_000))
	const jobId = randomUUID()
	db.insert(workJob)
		.values({
			id: jobId,
			userId,
			name: "Freelance design",
			rate: 2500,
			currency: "CAD",
			payAmount: 25000,
			payEveryDays: 7,
			color: "violet",
			notes: "Send the hours and total when billing.",
			createdAt: `${ago(90)} 12:00:00`,
		})
		.run()
	const bills: [
		daysAgo: number,
		hours: number,
		total: number,
		counter: number,
		note: string | null,
		payments: [daysAgo: number, amount: number][],
	][] = [
		[
			70,
			40,
			1000,
			160,
			null,
			[
				[63, 250],
				[56, 250],
				[49, 250],
				[42, 250],
			],
		],
		[
			27,
			48,
			1150,
			208,
			"Agreed a flat total for this one",
			[
				[20, 250],
				[13, 250],
				[6, 250],
			],
		],
		[4, 36.5, 912.5, 244.5, null, []],
	]
	for (const [daysAgo, hours, total, counter, note, payments] of bills) {
		const id = randomUUID()
		db.insert(workInvoice)
			.values({
				id,
				jobId,
				date: ago(daysAgo),
				hours,
				rate: 2500,
				total: toCents(total),
				counterHours: counter,
				note,
				createdAt: `${ago(daysAgo)} 12:00:00`,
			})
			.run()
		for (const [pAgo, amount] of payments) {
			db.insert(workPayment)
				.values({
					id: randomUUID(),
					invoiceId: id,
					amount: toCents(amount),
					date: ago(pAgo),
					note: "e-Transfer",
					createdAt: `${ago(pAgo)} 12:00:00`,
				})
				.run()
		}
	}
	for (const [daysAgo, hours, note] of [
		[3, 3.5, "Staff meeting + tickets"],
		[1, 2.25, null],
	] as const) {
		db.insert(workEntry)
			.values({
				id: randomUUID(),
				jobId,
				date: ago(daysAgo),
				hours,
				note,
				createdAt: `${ago(daysAgo)} 12:00:00`,
			})
			.run()
	}
}

/** A US client billed in USD through PayPal: one bill paid and converted to CAD on deposit, one part-paid, one open. */
const USD_BILLS: [
	daysAgo: number,
	hours: number,
	payments: [daysAgo: number, amount: number, receivedCad: number | null][],
][] = [
	[58, 22, [[50, 990, 1361.45]]],
	[
		30,
		18,
		[
			[24, 400, null],
			[10, 210, null],
		],
	],
	[5, 12.5, []],
]
const USD_RATE = 45

/** The USD PayPal wallet: client payments in, the first one transferred out (converted) to the bank. */
export function usdWallet(today: Date): Draft[] {
	const ago = (days: number) =>
		toIsoDate(new Date(today.getTime() - days * 86_400_000))
	const drafts: Draft[] = []
	for (const [, , payments] of USD_BILLS) {
		for (const [pAgo, amount, receivedCad] of payments) {
			drafts.push({
				date: ago(pAgo),
				description: "Payment from Brightline Media LLC",
				amount,
			})
			if (receivedCad != null) {
				drafts.push({
					date: ago(pAgo - 1),
					description: "Transfer to bank (converted to CAD)",
					amount: -amount,
				})
			}
		}
	}
	return drafts.toSorted((left, right) => left.date.localeCompare(right.date))
}

/** Demo work job with USD billing for seed data. */
export function seedUsdJob(today: Date, userId: string) {
	const ago = (days: number) =>
		toIsoDate(new Date(today.getTime() - days * 86_400_000))
	const jobId = randomUUID()
	db.insert(workJob)
		.values({
			id: jobId,
			userId,
			name: "Brightline Media (US)",
			rate: toCents(USD_RATE),
			currency: "USD",
			payAmount: null,
			payEveryDays: null,
			color: "ocean",
			notes: "Billed in USD, paid through PayPal.",
			createdAt: `${ago(75)} 12:00:00`,
		})
		.run()
	let counter = 0
	for (const [daysAgo, hours, payments] of USD_BILLS) {
		const id = randomUUID()
		counter += hours
		db.insert(workInvoice)
			.values({
				id,
				jobId,
				date: ago(daysAgo),
				hours,
				rate: toCents(USD_RATE),
				total: mulCents(toCents(USD_RATE), hours),
				counterHours: counter,
				note: null,
				createdAt: `${ago(daysAgo)} 12:00:00`,
			})
			.run()
		for (const [pAgo, amount, receivedCad] of payments) {
			db.insert(workPayment)
				.values({
					id: randomUUID(),
					invoiceId: id,
					amount: toCents(amount),
					date: ago(pAgo),
					note: "PayPal",
					receivedAmount: toCentsOrNull(receivedCad),
					receivedCurrency: receivedCad == null ? null : "CAD",
					createdAt: `${ago(pAgo)} 12:00:00`,
				})
				.run()
		}
	}
	db.insert(workEntry)
		.values({
			id: randomUUID(),
			jobId,
			date: ago(2),
			hours: 4,
			note: "Landing page revisions",
			createdAt: `${ago(2)} 12:00:00`,
		})
		.run()
}
