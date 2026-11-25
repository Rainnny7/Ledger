import type { TipArea, TipKind } from "@/lib/advisor"
import { formatMoney } from "@/lib/format"
import {
	AlertTriangle,
	Info,
	PartyPopper,
	PiggyBank,
	type LucideIcon,
} from "lucide-react"

/** Icon and colour classes for each tip kind (warn, save, info, win). */
export const KIND_META: Record<
	TipKind,
	{
		label: string
		icon: LucideIcon
		className: string
		card: string
		text: string
	}
> = {
	warn: {
		label: "Heads up",
		icon: AlertTriangle,
		className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
		card: "border-amber-500/30 bg-amber-500/[0.07] dark:bg-amber-500/[0.06]",
		text: "text-amber-700 dark:text-amber-400",
	},
	save: {
		label: "Save money",
		icon: PiggyBank,
		className: "bg-primary/12 text-primary",
		card: "border-primary/30 bg-primary/[0.06]",
		text: "text-primary",
	},
	info: {
		label: "Worth knowing",
		icon: Info,
		className: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
		card: "border-sky-500/30 bg-sky-500/[0.06]",
		text: "text-sky-700 dark:text-sky-400",
	},
	win: {
		label: "Nice work",
		icon: PartyPopper,
		className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
		card: "border-emerald-500/30 bg-emerald-500/[0.06]",
		text: "text-emerald-700 dark:text-emerald-400",
	},
}

/** The first sentence of a tip: the finding itself, short enough for the dashboard. */
export function headline(body: string) {
	return body.split(/(?<=[.!?])\s+(?=[A-Z0-9$])/)[0]
}

/** Human-readable label for each tip area. */
export const AREA_LABEL: Record<TipArea, string> = {
	spending: "Spending",
	subscriptions: "Subscriptions",
	fees: "Fees",
	savings: "Saving",
	goals: "Goals",
	credit: "Credit & bills",
}

/** Round yearly figure for a badge: "$410/yr". */
export const perYear = (amount: number) =>
	`${formatMoney(Math.round(amount)).replace(/\.00$/, "")}/yr`
