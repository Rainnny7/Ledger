/** Spending categories and billing periods, used by both the server and the app so they can't drift apart. */

export const CATEGORIES = [
  'income',
  'transfers',
  'food',
  'groceries',
  'transport',
  'shopping',
  'subscriptions',
  'bills',
  'entertainment',
  'health',
  'fees',
  'debt',
  'cash',
  'other',
] as const
export type Category = (typeof CATEGORIES)[number]

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
}

/** Named billing periods. Anything else is stored as "every-<n>-<weeks|months|years>". */
export const PRESET_CYCLES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'semiannual', 'yearly', 'biennial', 'triennial'] as const
export type PresetCycle = (typeof PRESET_CYCLES)[number]
export type CycleUnit = 'weeks' | 'months' | 'years'
/** A preset billing period, or a custom one like `every-5-years`. */
export type Cycle = PresetCycle | `every-${number}-${CycleUnit}`
