import assert from "node:assert/strict"
import { test } from "node:test"
import {
	NotATdStatement,
	parseTdStatement,
	type TextItem,
} from "../../../src/banks/td/statement.ts"

/** Lays words out like a TD statement page; each word is split into glyph runs the way the PDFs draw them. */
function page(
	rows: [y: number, ...words: [x: number, text: string][]][]
): TextItem[] {
	const items: TextItem[] = []
	for (const [y, ...words] of rows) {
		for (const [x, text] of words) {
			let at = x
			for (const run of text.match(/.{1,3}/g) ?? []) {
				items.push({ str: run, x: at, y, width: run.length * 4 })
				at += run.length * 4
			}
		}
	}
	return items
}

const header = (period: string): [number, ...[number, string][]][] => [
	[
		555,
		[94, "Statement"],
		[145, "of"],
		[157, "Account"],
		[284, "Account"],
		[327, "Type"],
		[434, "Statement"],
		[485, "From"],
		[513, "To"],
	],
	[
		540,
		[78, "Branch"],
		[115, "No."],
		[156, "Account"],
		[199, "No."],
		[428, period],
	],
	[530, [294, "STUDENT"]],
	[522, [94, "3203"], [154, "3203-6506887"], [446, "Page"], [473, "1"]],
	[
		495,
		[108, "Description"],
		[229, "Withdrawals"],
		[339, "Deposits"],
		[420, "Date"],
		[480, "Balance"],
	],
]

test("reads a statement that spans the new year", () => {
	const statement = parseTdStatement([
		page([
			...header("DEC29/23 - JAN31/24"),
			[
				484,
				[69, "STARTING"],
				[114, "BALANCE"],
				[417, "DEC29"],
				[508, "313.49OD"],
			],
			[
				474,
				[69, "PAYPAL*REID"],
				[128, "BRA"],
				[153, "_V"],
				[383, "78.36"],
				[418, "DEC30"],
				[508, "235.13OD"],
			],
			[
				465,
				[69, "WALMART"],
				[114, "STORE"],
				[146, "#"],
				[157, "_F"],
				[284, "28.11"],
				[418, "JAN08"],
			],
			[
				455,
				[69, "PAYPAL*REID"],
				[128, "BRA"],
				[153, "_V"],
				[369, "1,316.90"],
				[418, "JAN08"],
				[502, "1,053.66"],
			],
			[
				445,
				[69, "CLOSING"],
				[110, "BALANCE"],
				[418, "JAN31"],
				[502, "1,053.66"],
			],
			[435, [280, "28.11"], [369, "1,395.26"]],
			[400, [69, "Account/Transaction"], [176, "Type"], [240, "Fees"]],
		]),
	])
	assert.equal(statement.accountNumber, "3203-6506887")
	assert.equal(statement.accountType, "STUDENT")
	assert.equal(statement.from, "2023-12-29")
	assert.equal(statement.to, "2024-01-31")
	assert.equal(statement.openingBalance, -313.49)
	assert.equal(statement.closingBalance, 1053.66)
	assert.equal(statement.mismatch, null)
	assert.deepEqual(statement.transactions, [
		{
			date: "2023-12-30",
			description: "PAYPAL*REID BRA _V",
			amount: 78.36,
			runningBalance: -235.13,
			pending: false,
		},
		{
			date: "2024-01-08",
			description: "WALMART STORE # _F",
			amount: -28.11,
			runningBalance: null,
			pending: false,
		},
		{
			date: "2024-01-08",
			description: "PAYPAL*REID BRA _V",
			amount: 1316.9,
			runningBalance: 1053.66,
			pending: false,
		},
	])
})

test("continues onto later pages and falls back to the last balance when there is no closing row", () => {
	const statement = parseTdStatement([
		page([
			...header("NOV30/21 - DEC31/21"),
			[
				486,
				[69, "STARTING"],
				[114, "BALANCE"],
				[417, "NOV30"],
				[518, "4.56"],
			],
			[
				477,
				[69, "TD"],
				[83, "ATM"],
				[103, "W/D"],
				[129, "007875"],
				[284, "70.00"],
				[417, "DEC06"],
				[502, "65.44OD"],
			],
		]),
		page([
			...header("NOV30/21 - DEC31/21"),
			[
				486,
				[69, "Amazon.ca"],
				[121, "97.79_V"],
				[383, "97.79"],
				[417, "DEC29"],
				[518, "32.35"],
			],
		]),
	])
	assert.equal(statement.transactions.length, 2)
	assert.equal(statement.transactions[0].description, "TD ATM W/D 007875")
	assert.equal(statement.transactions[1].description, "Amazon.ca 97.79_V")
	assert.equal(statement.closingBalance, 32.35)
	assert.equal(statement.mismatch, null)
})

test("flags a statement whose rows do not add up to its balances", () => {
	const statement = parseTdStatement([
		page([
			...header("JAN31/23 - FEB28/23"),
			[
				484,
				[69, "STARTING"],
				[114, "BALANCE"],
				[418, "JAN31"],
				[513, "21.22"],
			],
			[
				474,
				[69, "DD"],
				[119, "_V"],
				[284, "28.67"],
				[418, "FEB01"],
				[513, "10.00"],
			],
		]),
	])
	assert.equal(statement.mismatch, 17.45)
})

test("rejects PDFs that are not TD bank statements", () => {
	assert.throws(
		() => parseTdStatement([page([[700, [69, "Some"], [100, "invoice"]]])]),
		NotATdStatement
	)
	assert.throws(
		() =>
			parseTdStatement([
				page(header("JAN31/23 - FEB28/23").filter(([y]) => y !== 495)),
			]),
		NotATdStatement
	)
})
