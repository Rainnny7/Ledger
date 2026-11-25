import assert from "node:assert/strict"
import { test } from "node:test"
import {
	findLabelledAmount,
	parseAccountDetails,
	parseAccountSummary,
	parseAmount,
	parseDate,
	parseTransactions,
	type RawFrame,
} from "../../../src/banks/td/parse.ts"

const today = new Date(2026, 10, 24) // Nov 24 2026

test("parseAmount handles TD money formats", () => {
	assert.equal(parseAmount("$1,234.56"), 1234.56)
	assert.equal(parseAmount("-$12.00"), -12)
	assert.equal(parseAmount("$12.00-"), -12)
	assert.equal(parseAmount("($45.10)"), -45.1)
	assert.equal(parseAmount("− $3.50"), -3.5)
	assert.equal(parseAmount("USD $9.99"), 9.99)
	assert.equal(parseAmount(""), null)
	assert.equal(parseAmount("n/a"), null)
})

test("parseDate handles TD date formats", () => {
	assert.equal(parseDate("Nov 21, 2026", today), "2026-11-21")
	assert.equal(parseDate("21 Nov 2026", today), "2026-11-21")
	assert.equal(parseDate("2026-01-05", today), "2026-01-05")
	assert.equal(parseDate("11/03/2026", today), "2026-11-03")
	assert.equal(parseDate("Dec 30", today), "2025-12-30") // no year + in the future → last year
	assert.equal(parseDate("Nov 20", today), "2026-11-20")
	assert.equal(parseDate("Pending", today), null)
})

const summaryFrame: RawFrame = {
	url: "https://easyweb.td.com/waw/ezw/webbanking",
	title: "Accounts",
	text: "",
	tables: [
		{
			index: 0,
			context: "Banking",
			headers: ["Account", "Balance", "Available"],
			rows: [
				{
					cells: [
						"TD UNLIMITED CHEQUING ACCOUNT 1234-5678901",
						"-$120.55",
						"$379.45",
					],
					link: "TD UNLIMITED CHEQUING ACCOUNT 1234-5678901",
				},
				{
					cells: [
						"TD EVERY DAY SAVINGS ACCOUNT 1234-1112223",
						"$2,500.00",
						"$2,500.00",
					],
					link: "TD EVERY DAY SAVINGS ACCOUNT 1234-1112223",
				},
				{ cells: ["Total", "$2,379.45", ""], link: null },
			],
		},
		{
			index: 1,
			context: "Credit Cards",
			headers: ["Account", "Balance", "Available Credit"],
			rows: [
				{
					cells: [
						"TD CASH BACK VISA INFINITE* CARD 4520 **** **** 9876",
						"$845.12",
						"$9,154.88",
					],
					link: "TD CASH BACK VISA INFINITE* CARD 4520 **** **** 9876",
				},
			],
		},
	],
}

test("parseAccountSummary finds accounts with balances and types", () => {
	const accts = parseAccountSummary([summaryFrame])
	assert.equal(accts.length, 3)
	const [chq, sav, visa] = accts
	assert.equal(chq.type, "chequing")
	assert.equal(chq.balance, -120.55)
	assert.equal(chq.available, 379.45)
	assert.equal(chq.numberMasked, "••••8901")
	assert.equal(sav.type, "savings")
	assert.equal(visa.type, "credit")
	assert.equal(visa.balance, 845.12)
	assert.equal(visa.numberMasked, "••••9876")
})

test("parseTransactions reads debit/credit columns", () => {
	const frame: RawFrame = {
		url: "",
		title: "",
		text: "",
		tables: [
			{
				index: 0,
				context: "Account activity",
				headers: ["Date", "Description", "Debit", "Credit", "Balance"],
				rows: [
					{
						cells: [
							"Nov 21, 2026",
							"TIM HORTONS #1234",
							"$4.25",
							"",
							"-$120.55",
						],
						link: null,
					},
					{
						cells: [
							"Nov 20, 2026",
							"PAYROLL DEP",
							"",
							"$1,500.00",
							"-$116.30",
						],
						link: null,
					},
				],
			},
		],
	}
	const txs = parseTransactions([frame], "chequing", today)
	assert.deepEqual(txs, [
		{
			date: "2026-11-21",
			description: "TIM HORTONS #1234",
			amount: -4.25,
			runningBalance: -120.55,
			pending: false,
		},
		{
			date: "2026-11-20",
			description: "PAYROLL DEP",
			amount: 1500,
			runningBalance: -116.3,
			pending: false,
		},
	])
})

test("parseTransactions flips credit-card single amount column", () => {
	const frame: RawFrame = {
		url: "",
		title: "",
		text: "",
		tables: [
			{
				index: 0,
				context: "Pending transactions",
				headers: [
					"Transaction Date",
					"Posted Date",
					"Description",
					"Amount",
				],
				rows: [
					{
						cells: ["Nov 22", "Nov 23", "AMAZON.CA", "$56.00"],
						link: null,
					},
					{
						cells: [
							"Nov 18",
							"Nov 19",
							"PAYMENT - THANK YOU",
							"-$200.00",
						],
						link: null,
					},
				],
			},
		],
	}
	const txs = parseTransactions([frame], "credit", today)
	assert.equal(txs[0].amount, -56)
	assert.equal(txs[0].date, "2026-11-22")
	assert.equal(txs[0].pending, true)
	assert.equal(txs[1].amount, 200)
})

test("findLabelledAmount reads label/value pairs", () => {
	const text =
		"Account details\nOverdraft protection limit\n$500.00\nCredit limit $10,000.00"
	assert.equal(findLabelledAmount(text, /overdraft protection limit/i), 500)
	assert.equal(findLabelledAmount(text, /credit limit/i), 10000)
})

test("parseAccountDetails reads direct deposit numbers and limits", () => {
	const text = [
		"Currently ViewingTD STUDENT CHEQUING ACCOUNT / 1234567",
		"Current Balance",
		"$1,000.00",
		"Overdraft Limit",
		"$500.00",
		"Direct deposit",
		"Institution number",
		"004",
		"Transit number",
		"12345",
		"Account number",
		"1234567",
		"Daily Interac e-Transfer limit",
		"$3,000.00",
		"Daily point of sale limit: $5,000.00",
		"ATM withdrawal limit",
		"Unlimited",
		"Limited time offer",
		"$10.00",
	].join("\n")
	assert.deepEqual(parseAccountDetails(text), {
		accountNumber: "1234567",
		transit: "12345",
		institution: "004",
		limits: [
			{
				label: "Daily Interac e-Transfer limit",
				amount: 3000,
				text: null,
			},
			{ label: "Daily point of sale limit", amount: 5000, text: null },
			{ label: "ATM withdrawal limit", amount: null, text: "Unlimited" },
		],
	})
	assert.deepEqual(parseAccountDetails("nothing here"), {
		accountNumber: null,
		transit: null,
		institution: null,
		limits: [],
	})
})
