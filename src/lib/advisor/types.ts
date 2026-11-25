import type {
  Account,
  Goal,
  RecurringSuggestion,
  Subscription,
  Transaction,
} from "../api"

export type TipKind = "warn" | "save" | "info" | "win"
export type TipArea =
  | "spending"
  | "subscriptions"
  | "fees"
  | "savings"
  | "goals"
  | "credit"

export interface Tip {
  /** Stable id; dismissing hides this exact tip. Ids that include a period come back next period. */
  id: string
  kind: TipKind
  area: TipArea
  title: string
  body: string
  /** Rough yearly amount you'd keep by acting on it. */
  yearly?: number
  action?: { label: string; to: string }
  /** Higher shows first. */
  priority: number
}

export interface HealthFactor {
  key: string
  label: string
  score: number
  max: number
  detail: string
}

export interface Health {
  score: number
  label: "Excellent" | "Good" | "Fair" | "Needs attention"
  factors: HealthFactor[]
}

export interface AdvisorSummary {
  /** Share of income left after spending and loan payments, over the last few full months. */
  savingsRate: number | null
  avgIncome: number | null
  avgOut: number | null
  /** Months your cash would cover at your usual spending. */
  cushionMonths: number | null
  subscriptionsYearly: number
  /** Sum of `yearly` over the tips you can act on. */
  potentialYearly: number
  /** The full months the averages are based on. */
  months: string[]
}

export interface AdvisorReport {
  tips: Tip[]
  health: Health | null
  summary: AdvisorSummary
}

export interface AdvisorInput {
  today: string
  home: string
  accounts: Account[]
  /** Newest first, in the home currency. */
  transactions: Transaction[]
  subscriptions: Subscription[]
  suggestions: RecurringSuggestion[]
  goals: Goal[]
  /** Converts an amount into the home currency (falls back to the amount itself). */
  toHome: (amount: number, currency: string) => number
}

export interface MonthFigures {
  month: string
  income: number
  spent: number
  debt: number
  out: number
  net: number
}

/** Everything a rule gets: the input plus the averages worked out once in buildAdvice. */
export interface Ctx extends AdvisorInput {
  thisMonth: string
  months: string[]
  figures: MonthFigures[]
  avgIncome: number | null
  avgOut: number | null
  hasIncome: boolean
  savingsRate: number | null
  surplus: number | null
}
