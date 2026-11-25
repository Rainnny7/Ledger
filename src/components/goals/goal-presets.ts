import type { GoalInput } from "@/lib/api"

export const GOAL_PRESETS: (Partial<GoalInput> & { blurb: string })[] = [
  {
    name: "Emergency fund",
    icon: "shield",
    color: "forest",
    target: 5000,
    blurb: "3 months of essentials",
  },
  {
    name: "Dream trip",
    icon: "plane",
    color: "ocean",
    target: 3000,
    blurb: "Flights, hotel, fun money",
  },
  {
    name: "Pay off my card",
    icon: "credit-card",
    color: "rose",
    kind: "payoff",
    target: 1500,
    blurb: "Be done with interest",
  },
  {
    name: "New laptop",
    icon: "laptop",
    color: "violet",
    target: 1800,
    blurb: "Upgrade without the debt",
  },
]
