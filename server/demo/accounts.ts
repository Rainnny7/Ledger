import { roundMoney } from "../../shared/money.ts"
import type { ScrapedAccount, ScrapedTransaction } from "../banks/types.ts"
import { type Draft } from "./util.ts"

/** Running balances forward from an opening balance; newest first like a bank's own list. */
function finish(
	list: Draft[],
	opening: number
): { transactions: ScrapedTransaction[]; balance: number } {
	let running = opening
	const transactions = list.map((transaction) => {
		running = roundMoney(running + transaction.amount)
		return { ...transaction, runningBalance: running, pending: false }
	})
	return { transactions: transactions.toReversed(), balance: running }
}

/** Build a demo bank account with generated transactions. */
export function account(
	externalKey: string,
	name: string,
	type: ScrapedAccount["type"],
	numberMasked: string | null,
	opening: number,
	drafts: Draft[],
	extra: (balance: number) => Partial<ScrapedAccount> = () => ({})
): ScrapedAccount {
	const { transactions, balance } = finish(drafts, opening)
	return {
		externalKey,
		name,
		type,
		numberMasked,
		currency: "CAD",
		balance,
		available: balance,
		overdraftLimit: null,
		overdraftUsed: null,
		creditLimit: null,
		transactions,
		historyFrom: transactions.at(-1)?.date ?? null,
		details: null,
		...extra(balance),
	}
}
