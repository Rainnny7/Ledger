import { Elysia } from "elysia"
import { adviceRoutes } from "./advice.ts"
import { budgetRoutes } from "./budgets.ts"
import { goalRoutes } from "./goals.ts"
import { subscriptionRoutes } from "./subscriptions.ts"
import { transactionRoutes } from "./transactions.ts"

/** Type values accepted by validation and routes. */
export type { EnrichedTx } from "./types.ts"

/** Budgets, transactions, subscriptions, goals and advice, all behind the signed-in session. */
export const finance = new Elysia({ name: "finance" })
	.use(budgetRoutes)
	.use(transactionRoutes)
	.use(subscriptionRoutes)
	.use(goalRoutes)
	.use(adviceRoutes)
