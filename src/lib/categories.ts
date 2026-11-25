import {
  ArrowLeftRight,
  Banknote,
  BriefcaseBusiness,
  UserRound,
  Car,
  CircleDollarSign,
  CircleEllipsis,
  Clapperboard,
  HeartPulse,
  Landmark,
  type LucideIcon,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingBasket,
  Utensils,
  Wallet,
} from "lucide-react"
import type { Category, TaxTag } from "./api"

export const CATEGORY_META: Record<
  Category,
  { label: string; icon: LucideIcon }
> = {
  income: { label: "Income", icon: Wallet },
  transfers: { label: "Transfers", icon: ArrowLeftRight },
  food: { label: "Food & dining", icon: Utensils },
  groceries: { label: "Groceries", icon: ShoppingBasket },
  transport: { label: "Transport", icon: Car },
  shopping: { label: "Shopping", icon: ShoppingBag },
  subscriptions: { label: "Subscriptions", icon: Repeat },
  bills: { label: "Bills & utilities", icon: Receipt },
  entertainment: { label: "Entertainment", icon: Clapperboard },
  health: { label: "Health & fitness", icon: HeartPulse },
  fees: { label: "Fees & interest", icon: CircleDollarSign },
  debt: { label: "Loan & debt payments", icon: Landmark },
  cash: { label: "Cash", icon: Banknote },
  other: { label: "Other", icon: CircleEllipsis },
}

export const CATEGORY_LIST = Object.keys(CATEGORY_META) as Category[]

/**
 * Not spending: moving money between your own accounts or people, pay, and loan repayments (they
 * pay down a balance rather than buy anything; shown separately). Excluded from spend totals.
 */
export const NON_SPEND: ReadonlySet<Category> = new Set([
  "transfers",
  "income",
  "debt",
])

/** Tax tags as they're shown: business (side work, self-employment) or personal. */
export const TAX_TAG_META: Record<
  TaxTag,
  { label: string; icon: LucideIcon; hint: string }
> = {
  business: {
    label: "Business",
    icon: BriefcaseBusiness,
    hint: "Part of your work: income, or an expense you might claim",
  },
  personal: {
    label: "Personal",
    icon: UserRound,
    hint: "Your own spending, not part of a business",
  },
}
export const TAX_TAG_LIST = Object.keys(TAX_TAG_META) as TaxTag[]
