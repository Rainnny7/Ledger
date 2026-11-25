import {
  Bike,
  Camera,
  Car,
  CreditCard,
  Gem,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Laptop,
  type LucideIcon,
  Music,
  PartyPopper,
  PiggyBank,
  Plane,
  ShieldCheck,
  Target,
} from "lucide-react"
import type { CSSProperties } from "react"
import type { GoalStatus } from "@/lib/api"

export const GOAL_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  target: { icon: Target, label: "Goal" },
  "piggy-bank": { icon: PiggyBank, label: "Savings" },
  shield: { icon: ShieldCheck, label: "Emergency fund" },
  plane: { icon: Plane, label: "Travel" },
  home: { icon: Home, label: "Home" },
  car: { icon: Car, label: "Car" },
  laptop: { icon: Laptop, label: "Tech" },
  gift: { icon: Gift, label: "Gift" },
  "graduation-cap": { icon: GraduationCap, label: "Education" },
  heart: { icon: Heart, label: "Wedding" },
  gem: { icon: Gem, label: "Treat" },
  "credit-card": { icon: CreditCard, label: "Debt" },
  bike: { icon: Bike, label: "Hobby" },
  music: { icon: Music, label: "Music" },
  camera: { icon: Camera, label: "Camera" },
  party: { icon: PartyPopper, label: "Party" },
}

/** One solid accent per colour: used for icons, bars and rings, and as a soft tint behind icons. */
export const GOAL_COLORS: Record<string, { color: string; label: string }> = {
  sunset: { color: "#ee7d52", label: "Sunset" },
  rose: { color: "#e5487f", label: "Rose" },
  ocean: { color: "#1e9bd7", label: "Ocean" },
  forest: { color: "#10a37a", label: "Forest" },
  gold: { color: "#e0a000", label: "Gold" },
  violet: { color: "#8b6cf0", label: "Violet" },
  slate: { color: "#64748b", label: "Slate" },
}

export const goalIcon = (key: string) => GOAL_ICONS[key]?.icon ?? Target
export const goalColor = (key: string) =>
  (GOAL_COLORS[key] ?? GOAL_COLORS.sunset).color

/** Solid fill in the goal's colour (swatches, progress bars). */
export const accentStyle = (key: string): CSSProperties => ({
  backgroundColor: goalColor(key),
})

/** A quiet tile: the colour at low opacity behind an icon drawn in the colour itself. */
export const tintStyle = (key: string): CSSProperties => {
  const c = goalColor(key)
  return {
    backgroundColor: `color-mix(in oklab, ${c} 14%, transparent)`,
    color: c,
  }
}

export const STATUS_META: Record<
  GoalStatus,
  { label: string; className: string }
> = {
  done: {
    label: "Reached",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  ahead: {
    label: "Ahead",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  "on-track": {
    label: "On track",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  behind: {
    label: "Behind",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  overdue: {
    label: "Past due",
    className: "bg-destructive/15 text-destructive",
  },
  "no-date": {
    label: "No deadline",
    className: "bg-muted text-muted-foreground",
  },
}
