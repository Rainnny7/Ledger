import { randomUUID } from "node:crypto"
import { saveScrape } from "../banks/store.ts"
import type { ScrapedAccount } from "../banks/types.ts"
import { and, eq } from "drizzle-orm"
import { db, getSetting, setSetting } from "../db/connection.ts"
import {
	adviceDismissed,
	bankAccount,
	bankConnection,
	budget,
	categoryRule,
	goal,
	subscription,
	subscriptionDismissed,
	user,
	workJob,
} from "../db/schema/index.ts"
import { merchantKeyOf } from "../finance/categorize.ts"
import { account } from "./accounts.ts"
import { generate } from "./generate.ts"
import { seedGoals } from "./goals.ts"
import {
	DEFAULT_PERSONA,
	emailOf,
	type Persona,
	PERSONAS,
	personaOf,
	userIdOf,
} from "./personas.ts"
import { roundMoney, toCents } from "@ledger/shared/money"
import { toIsoDate } from "./util.ts"
import { seedDemoNotifications } from "./notifications.ts"
import { seedUsdJob, seedWork, usdWallet } from "./work.ts"

const SEED_VERSION = "8"

function ensureDemoUser(p: Persona) {
	const now = new Date().toISOString()
	db.insert(user)
		.values({
			id: userIdOf(p),
			name: p.name,
			email: emailOf(p),
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
			role: "user",
			banned: true,
			onboardingCompletedAt: now,
		})
		.onConflictDoNothing({ target: user.id })
		.run()
	db.update(user)
		.set({ onboardingCompletedAt: now, updatedAt: now })
		.where(eq(user.id, userIdOf(p)))
		.run()
}

/** Subscriptions for personas that don't have a hand-written list: one per recurring card charge. */
const SUB_NAMES: Record<string, [name: string, category: string]> = {
	NETFLIX: ["Netflix", "subscriptions"],
	SPOTIFY: ["Spotify", "subscriptions"],
	APPLE: ["Apple services", "subscriptions"],
	EQUINOX: ["Equinox", "health"],
	OPENAI: ["ChatGPT Plus", "subscriptions"],
}

function seed(today: Date, p: Persona) {
	const userId = userIdOf(p)
	const { chequing, savings, visa, paypal } = generate(today, p)
	db.delete(bankConnection).where(eq(bankConnection.userId, userId)).run()
	db.delete(subscription).where(eq(subscription.userId, userId)).run()
	db.delete(subscriptionDismissed)
		.where(eq(subscriptionDismissed.userId, userId))
		.run()
	db.delete(adviceDismissed).where(eq(adviceDismissed.userId, userId)).run()
	db.delete(categoryRule).where(eq(categoryRule.userId, userId)).run()
	db.delete(budget).where(eq(budget.userId, userId)).run()
	if (p.budgets.length > 0) {
		db.insert(budget)
			.values(
				p.budgets.map(([category, amount]) => ({
					userId,
					category,
					amount: toCents(amount),
					currency: p.currency,
				}))
			)
			.run()
	}
	db.delete(goal).where(eq(goal.userId, userId)).run() // payments cascade
	db.delete(workJob).where(eq(workJob.userId, userId)).run() // bills, shifts, payments cascade

	const inCurrency = (a: ScrapedAccount): ScrapedAccount => ({
		...a,
		currency: a.currency === "CAD" ? p.currency : a.currency,
	})
	saveScrape({
		userId,
		connectionId: null,
		institution: "td",
		label: p.id === "musk" ? "TD Private Banking" : "TD EasyWeb",
		usernameMasked: "•••• 2291",
		credentialsEnc: null,
		browserStateEnc: null,
		accounts: [
			account(
				"demo:chq",
				p.accounts.chequing,
				"chequing",
				"•••4417",
				p.opening.chequing,
				chequing,
				(balance) => ({
					overdraftLimit: p.overdraft,
					overdraftUsed: 0,
					available: roundMoney(balance + p.overdraft),
				})
			),
			account(
				"demo:sav",
				p.accounts.savings,
				"savings",
				"•••6243",
				p.opening.savings,
				savings
			),
			account(
				"demo:visa",
				p.accounts.visa,
				"credit",
				"•••8830",
				p.opening.visa,
				visa,
				(balance) => ({
					creditLimit: p.creditLimit,
					available: roundMoney(p.creditLimit + balance),
				})
			),
			// Even a billionaire's money mostly sits in holdings rather than in a bank account.
			...(p.id === "musk"
				? [
						account(
							"demo:inv",
							"Holdings (TSLA, SpaceX, xAI)",
							"investment",
							"•••0001",
							240_000_000_000,
							[]
						),
					]
				: []),
		].map(inCurrency),
	})
	if (p.extras) {
		saveScrape({
			userId,
			connectionId: null,
			institution: "paypal",
			label: "PayPal",
			usernameMasked: "API app",
			credentialsEnc: null,
			browserStateEnc: null,
			accounts: [
				account(
					"paypal:CAD",
					"PayPal balance",
					"wallet",
					null,
					80.18,
					paypal
				),
				// US client payments land here (see seedWork); one was moved out and converted to CAD.
				account(
					"paypal:USD",
					"PayPal balance (USD)",
					"wallet",
					null,
					0,
					usdWallet(today),
					() => ({ currency: "USD" })
				),
			],
		})
	}

	const visaId = db
		.select({ id: bankAccount.id })
		.from(bankAccount)
		.innerJoin(
			bankConnection,
			eq(bankConnection.id, bankAccount.connectionId)
		)
		.where(
			and(
				eq(bankConnection.userId, userId),
				eq(bankAccount.externalKey, "demo:visa")
			)
		)
		.get()!.id
	const anchor = (dom: number) =>
		toIsoDate(
			new Date(
				Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, dom)
			)
		)
	const subs: [
		name: string,
		amount: number,
		currency: string,
		cycle: string,
		anchor: string,
		category: string,
		merchant: string | null,
		account: string | null,
	][] = [
		[
			"Netflix",
			18.99,
			"CAD",
			"monthly",
			anchor(4),
			"subscriptions",
			"Netflix",
			visaId,
		],
		[
			"Spotify",
			11.99,
			"CAD",
			"monthly",
			anchor(9),
			"subscriptions",
			"Spotify",
			visaId,
		],
		[
			"GoodLife Fitness",
			54.99,
			"CAD",
			"monthly",
			anchor(22),
			"health",
			"Goodlife Fitness",
			visaId,
		],
		[
			"Rogers Wireless",
			85.4,
			"CAD",
			"monthly",
			anchor(8),
			"bills",
			"Rogers",
			null,
		],
		[
			"ChatGPT Plus",
			20,
			"USD",
			"monthly",
			anchor(26),
			"subscriptions",
			"OpenAI ChatGPT Subscr",
			visaId,
		],
		[
			"GitHub Copilot",
			100,
			"USD",
			"yearly",
			toIsoDate(
				new Date(
					Date.UTC(
						today.getUTCFullYear(),
						today.getUTCMonth() - 4,
						11
					)
				)
			),
			"subscriptions",
			null,
			null,
		],
		[
			"Proton Mail",
			47.88,
			"EUR",
			"yearly",
			toIsoDate(
				new Date(
					Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 9, 3)
				)
			),
			"subscriptions",
			null,
			null,
		],
		[
			"Domain renewal",
			64,
			"CAD",
			"every-4-years",
			toIsoDate(new Date(Date.UTC(today.getUTCFullYear() - 2, 2, 17))),
			"subscriptions",
			null,
			null,
		],
		[
			"Antivirus",
			89.99,
			"CAD",
			"biennial",
			toIsoDate(new Date(Date.UTC(today.getUTCFullYear() - 1, 9, 2))),
			"subscriptions",
			null,
			null,
		],
	]
	if (!p.extras) {
		subs.length = 0
		for (const [dom, description, amount] of p.cardSubs) {
			const [name, category] = SUB_NAMES[
				description.split(/[ .*]/)[0]
			] ?? [description, "subscriptions"]
			subs.push([
				name,
				amount,
				p.currency,
				"monthly",
				anchor(dom),
				category,
				name,
				visaId,
			])
		}
	}
	for (const [
		name,
		amount,
		currency,
		cycle,
		anchorDate,
		category,
		merchant,
		accountId,
	] of subs) {
		db.insert(subscription)
			.values({
				id: randomUUID(),
				userId,
				name,
				amount: toCents(amount),
				currency,
				cycle,
				anchorDate,
				category,
				accountId,
				merchantKey: merchant ? merchantKeyOf(merchant) : null,
			})
			.run()
	}

	seedGoals(today, p, userId)
	if (p.extras) {
		seedWork(today, userId)
		seedUsdJob(today, userId)
	}
	seedDemoNotifications(today, p, userId)
}

/** Make sure today's data exists for a demo persona. Cheap after the first call of the day. */
export function ensureDemoData(personaId?: string | null) {
	const persona = personaOf(personaId)
	const today = new Date()
	const stamp = `${SEED_VERSION}:${toIsoDate(today)}`
	const key =
		persona.id === DEFAULT_PERSONA
			? "demo_seeded"
			: `demo_seeded:${persona.id}`
	if (
		getSetting(key) === stamp &&
		db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.id, userIdOf(persona)))
			.get()
	) {
		return
	}
	ensureDemoUser(persona)
	seed(today, persona)
	setSetting(key, stamp)
}

/** Throw away every demo user's data (and anything changed since) and generate it again. */
export function reseedDemoData() {
	const today = new Date()
	for (const persona of Object.values(PERSONAS)) {
		ensureDemoUser(persona)
		seed(today, persona)
		setSetting(
			persona.id === DEFAULT_PERSONA
				? "demo_seeded"
				: `demo_seeded:${persona.id}`,
			`${SEED_VERSION}:${toIsoDate(today)}`
		)
	}
}
