import { Hono } from "hono"
import { mountAdvice } from "./advice.ts"
import { mountBudgets } from "./budgets.ts"
import { mountGoals } from "./goals.ts"
import { mountSubscriptions } from "./subscriptions.ts"
import { mountTransactions } from "./transactions.ts"
import type { Vars } from "./types.ts"

export type { EnrichedTx } from "./types.ts"

type FinanceVars = Vars
export const finance = new Hono<FinanceVars>()

mountBudgets(finance)
mountTransactions(finance)
mountSubscriptions(finance)
mountGoals(finance)
mountAdvice(finance)
