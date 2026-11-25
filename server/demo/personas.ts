/** The made-up people behind the demo, and the user ids and addresses their data lives under. */
/** Every demo persona's user id starts with this; the first one keeps the original id. */
const DEMO_PREFIX = "ledger-demo"
export const DEMO_USER_ID = DEMO_PREFIX
export const DEMO_EMAIL = "demo@ledger.invalid"

/** Whether a user id belongs to one of the built-in demo users. */
export const isDemoUserId = (id: string) => id.startsWith(DEMO_PREFIX)
/** Whether an address is one of the reserved demo addresses. */
export const isDemoEmail = (email: string) =>
  /^demo(-[a-z]+)?@ledger\.invalid$/.test(email.trim().toLowerCase())

type Spend = { lo: number; hi: number }

/** One made-up person: how much they earn, where it goes, and what their accounts look like. */
export interface Persona {
  id: string
  name: string
  currency: string
  /** Job pay lands in chequing; `monthly` pays on the 1st, `biweekly` every other Friday. */
  pay: { description: string; amount: number; every: "biweekly" | "monthly" }
  rent: { description: string; amount: number }
  /** Moved from chequing to savings on the 3rd. */
  savingsTransfer: number
  phone: { description: string; amount: number }
  hydro: Spend | null
  gas: Spend | null
  /** Scales everyday card spending. */
  scale: number
  bulkShopping: boolean
  /** Recurring charges on the card: [day of month, description, amount]. */
  cardSubs: [number, string, number][]
  opening: { chequing: number; savings: number; visa: number }
  creditLimit: number
  overdraft: number
  accounts: { chequing: string; savings: string; visa: string }
  budgets: [category: string, amount: number][]
  /** Whether the freelance jobs, goals and subscriptions below the bank data are seeded. */
  extras: boolean
}

export const DEFAULT_PERSONA = "average"
export const personaOf = (id: string | null | undefined) =>
  PERSONAS[id ?? ""] ?? PERSONAS[DEFAULT_PERSONA]
/** The user id each persona's data lives under. The default keeps the original id. */
export const userIdOf = (p: Persona) =>
  p.id === DEFAULT_PERSONA ? DEMO_USER_ID : `${DEMO_PREFIX}-${p.id}`
export const emailOf = (p: Persona) =>
  p.id === DEFAULT_PERSONA ? DEMO_EMAIL : `demo-${p.id}@ledger.invalid`

export const PERSONAS: Record<string, Persona> = {
  musk: {
    id: "musk",
    name: "Elon Musk",
    currency: "USD",
    pay: { description: "SPACEX DISTRIBUTION", amount: 0, every: "monthly" },
    rent: { description: "STARBASE ESTATE UPKEEP", amount: 285000 },
    savingsTransfer: 150_000_000,
    phone: { description: "STARLINK SERVICE", amount: 0 },
    hydro: null,
    gas: null,
    scale: 1,
    bulkShopping: false,
    cardSubs: [],
    opening: {
      chequing: 140_000_000,
      savings: 3_400_000_000,
      visa: -1_250_000,
    },
    creditLimit: 25_000_000,
    overdraft: 0,
    accounts: {
      chequing: "Private Banking Operating",
      savings: "Treasury Reserve",
      visa: "Black Card",
    },
    budgets: [
      ["food", 15_000],
      ["shopping", 400_000],
      ["entertainment", 250_000],
    ],
    extras: false,
  },
  student: {
    id: "student",
    name: "Jordan Lee",
    currency: "CAD",
    pay: {
      description: "PAYROLL DEP BEANHOUSE CAFE",
      amount: 660.4,
      every: "biweekly",
    },
    rent: { description: "CAMPUS HOUSING RENT", amount: 720 },
    savingsTransfer: 40,
    phone: { description: "FIDO MOBILE PAD", amount: 38 },
    hydro: null,
    gas: null,
    scale: 0.3,
    bulkShopping: false,
    cardSubs: [
      [9, "SPOTIFY P1A2B3C4", 6.99],
      [14, "APPLE.COM/BILL", 1.29],
    ],
    opening: { chequing: 940, savings: 1250, visa: -90 },
    creditLimit: 1500,
    overdraft: 0,
    accounts: {
      chequing: "TD Student Chequing",
      savings: "TD Every Day Savings",
      visa: "TD Student Visa",
    },
    budgets: [
      ["groceries", 220],
      ["food", 90],
      ["entertainment", 40],
    ],
    extras: false,
  },
  average: {
    id: "average",
    name: "Alex Morgan",
    currency: "CAD",
    pay: {
      description: "PAYROLL DEP NORTHWIND LABS",
      amount: 2184.62,
      every: "biweekly",
    },
    rent: { description: "PARKVIEW PROPERTIES RENT", amount: 1650 },
    savingsTransfer: 400,
    phone: { description: "ROGERS WIRELESS PAD", amount: 85.4 },
    hydro: { lo: 72, hi: 138 },
    gas: { lo: 38, hi: 96 },
    scale: 1,
    bulkShopping: true,
    cardSubs: [
      [4, "NETFLIX.COM", 18.99],
      [9, "SPOTIFY P1A2B3C4", 11.99],
      [14, "APPLE.COM/BILL", 3.99],
      [22, "GOODLIFE FITNESS", 54.99],
      [26, "OPENAI *CHATGPT SUBSCR", 28.25],
    ],
    opening: { chequing: 1840.55, savings: 7325.4, visa: -612.3 },
    creditLimit: 6000,
    overdraft: 500,
    accounts: {
      chequing: "TD Every Day Chequing",
      savings: "TD ePremium Savings",
      visa: "TD Cash Back Visa",
    },
    budgets: [
      ["groceries", 600],
      ["food", 250],
      ["shopping", 300],
      ["entertainment", 80],
    ],
    extras: true,
  },
  executive: {
    id: "executive",
    name: "Morgan Ellis",
    currency: "CAD",
    pay: {
      description: "PAYROLL DEP HALVORSEN GROUP",
      amount: 6480.35,
      every: "biweekly",
    },
    rent: { description: "TD MORTGAGE PAYMENT", amount: 4150 },
    savingsTransfer: 3000,
    phone: { description: "BELL MOBILITY PAD", amount: 210 },
    hydro: { lo: 190, hi: 340 },
    gas: { lo: 90, hi: 210 },
    scale: 2.2,
    bulkShopping: true,
    cardSubs: [
      [4, "NETFLIX.COM", 22.99],
      [9, "SPOTIFY P1A2B3C4", 16.99],
      [14, "APPLE.COM/BILL", 14.99],
      [20, "EQUINOX CLUBS", 289],
      [26, "OPENAI *CHATGPT SUBSCR", 28.25],
    ],
    opening: { chequing: 18400, savings: 96200, visa: -3100 },
    creditLimit: 30000,
    overdraft: 5000,
    accounts: {
      chequing: "TD Private Chequing",
      savings: "TD High Interest Savings",
      visa: "TD Aeroplan Infinite Visa",
    },
    budgets: [
      ["groceries", 1400],
      ["food", 1100],
      ["shopping", 1500],
      ["entertainment", 600],
    ],
    extras: false,
  },
}
