import { randomUUID } from "node:crypto"
import { db } from "../db.ts"
import { toCents } from "../../shared/money.ts"
import type { Persona } from "./personas.ts"
import { iso } from "./util.ts"

type GoalSpec = {
  name: string
  kind: "save" | "payoff"
  target: number
  targetDate: string | null
  icon: string
  color: string
  notes: string | null
  createdMonthsAgo: number
  payments: [
    monthsAgo: number,
    dom: number,
    amount: number,
    note: string | null,
  ][]
}

/** Goals at different stages for the average earner: `day` and `ahead` are dates relative to today. */
function alexGoals(
  day: (monthsAgo: number, dom: number) => string,
  ahead: (months: number) => string
): GoalSpec[] {
  return [
    {
      name: "Japan trip",
      kind: "save",
      target: 4500,
      targetDate: ahead(7),
      icon: "plane",
      color: "ocean",
      notes: "Two weeks in Tokyo and Kyoto during cherry blossom season",
      createdMonthsAgo: 6,
      payments: [
        [6, 2, 600, "Already saved"],
        [5, 5, 250, null],
        [4, 5, 250, null],
        [3, 5, 250, null],
        [3, 21, 180, "Sold old bike"],
        [2, 5, 250, null],
        [1, 5, 250, null],
        [0, 5, 250, null],
      ],
    },
    {
      name: "Emergency fund",
      kind: "save",
      target: 6000,
      targetDate: null,
      icon: "shield",
      color: "forest",
      notes: "Three months of rent and bills",
      createdMonthsAgo: 11,
      payments: [
        [11, 3, 1500, "Already saved"],
        ...Array.from(
          { length: 11 },
          (_, i): [number, number, number, string | null] => [
            10 - i,
            3,
            200,
            "Monthly top-up",
          ]
        ),
        [4, 18, -350, "Car repair"],
      ],
    },
    {
      name: "Pay off Visa",
      kind: "payoff",
      target: 2400,
      targetDate: ahead(3),
      icon: "credit-card",
      color: "rose",
      notes: null,
      createdMonthsAgo: 4,
      payments: [
        [4, 19, 300, null],
        [3, 19, 300, null],
        [2, 19, 250, null],
        [1, 19, 300, null],
        [0, 2, 150, "Bonus payment"],
      ],
    },
    {
      name: "New laptop",
      kind: "save",
      target: 1600,
      targetDate: day(1, 10),
      icon: "laptop",
      color: "violet",
      notes: null,
      createdMonthsAgo: 8,
      payments: [
        [8, 1, 400, "Already saved"],
        [7, 1, 200, null],
        [6, 1, 200, null],
        [5, 1, 200, null],
        [4, 1, 200, null],
        [3, 1, 200, null],
        [2, 1, 200, null],
      ],
    },
  ]
}

const monthlyPayments = (
  from: number,
  dom: number,
  amount: number,
  note: string | null
) =>
  Array.from(
    { length: from + 1 },
    (_, i): [number, number, number, string | null] => [
      from - i,
      dom,
      amount,
      note,
    ]
  )

function otherGoals(
  id: string,
  day: (monthsAgo: number, dom: number) => string,
  ahead: (months: number) => string
): GoalSpec[] {
  if (id === "student")
    return [
      {
        name: "Next term's textbooks",
        kind: "save",
        target: 650,
        targetDate: ahead(2),
        icon: "graduation-cap",
        color: "violet",
        notes: null,
        createdMonthsAgo: 4,
        payments: monthlyPayments(3, 5, 90, null),
      },
      {
        name: "Reading week trip",
        kind: "save",
        target: 900,
        targetDate: ahead(5),
        icon: "plane",
        color: "ocean",
        notes: "Road trip with friends",
        createdMonthsAgo: 5,
        payments: monthlyPayments(4, 20, 60, null),
      },
    ]
  if (id === "executive")
    return [
      {
        name: "Cottage down payment",
        kind: "save",
        target: 180000,
        targetDate: ahead(30),
        icon: "home",
        color: "forest",
        notes: "20% down on a place up north",
        createdMonthsAgo: 11,
        payments: [
          [11, 3, 62000, "Already saved"],
          ...monthlyPayments(10, 4, 3000, "Monthly top-up"),
        ],
      },
      {
        name: "Pay off Visa",
        kind: "payoff",
        target: 6500,
        targetDate: ahead(2),
        icon: "credit-card",
        color: "rose",
        notes: null,
        createdMonthsAgo: 3,
        payments: monthlyPayments(2, 19, 2000, null),
      },
    ]
  return [
    {
      name: "Make life multiplanetary",
      kind: "save",
      target: 5_000_000_000,
      targetDate: ahead(48),
      icon: "target",
      color: "rose",
      notes: "Starship fleet, one Mars city",
      createdMonthsAgo: 11,
      payments: monthlyPayments(
        10,
        6,
        150_000_000,
        "Quarterly bonus to the cause"
      ),
    },
  ]
}

/** Goals at different stages, with a history of partial payments. */
export function seedGoals(today: Date, p: Persona, userId: string) {
  const personaId = p.id
  const day = (monthsAgo: number, dom: number) =>
    iso(
      new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth() - monthsAgo,
          Math.min(dom, 28)
        )
      )
    )
  const ahead = (months: number) => day(-months, 15)
  const goals =
    personaId === "average"
      ? alexGoals(day, ahead)
      : otherGoals(personaId, day, ahead)
  const insertGoal = db.prepare(
    `INSERT INTO goal (id, user_id, name, kind, target, target_date, icon, color, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insertPayment = db.prepare(
    `INSERT INTO goal_payment (id, goal_id, amount, date, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  )
  const todayIso = iso(today)
  for (const g of goals) {
    const id = randomUUID()
    const created = day(g.createdMonthsAgo, 1)
    insertGoal.run(
      id,
      userId,
      g.name,
      g.kind,
      toCents(g.target),
      g.targetDate,
      g.icon,
      g.color,
      g.notes,
      `${created} 12:00:00`
    )
    for (const [monthsAgo, dom, amount, note] of g.payments) {
      const date = day(monthsAgo, dom)
      if (date > todayIso) continue
      insertPayment.run(
        randomUUID(),
        id,
        toCents(amount),
        date,
        note,
        `${date} 12:00:00`
      )
    }
  }
}
