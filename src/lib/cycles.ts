import type { Cycle, CycleUnit, PresetCycle } from "./api"
import { addDays, isoDate, parseIso } from "./format"

/** Presets in the order the billing-period picker lists them. */
export const PRESET_CYCLES: { value: PresetCycle; label: string }[] = [
	{ value: "weekly", label: "Weekly" },
	{ value: "biweekly", label: "Every 2 weeks" },
	{ value: "monthly", label: "Monthly" },
	{ value: "quarterly", label: "Every 3 months" },
	{ value: "semiannual", label: "Every 6 months" },
	{ value: "yearly", label: "Yearly" },
	{ value: "biennial", label: "Every 2 years" },
	{ value: "triennial", label: "Every 3 years" },
]

/** Units available when building a custom billing period (weeks, months, years). */
export const CYCLE_UNITS: { value: CycleUnit; label: string; max: number }[] = [
	{ value: "weeks", label: "weeks", max: 104 },
	{ value: "months", label: "months", max: 120 },
	{ value: "years", label: "years", max: 10 },
]

const CUSTOM = /^every-(\d{1,3})-(weeks|months|years)$/

/** A custom period as { every, unit }, or null for a preset. */
export function parseCustomCycle(
	cycle: Cycle
): { every: number; unit: CycleUnit } | null {
	const match = CUSTOM.exec(cycle)
	return match
		? { every: Number(match[1]), unit: match[2] as CycleUnit }
		: null
}

/** "every N unit" as a cycle, folded into a preset when one means the same thing. */
export function customCycle(every: number, unit: CycleUnit): Cycle {
	const match: Record<string, PresetCycle> = {
		"1-weeks": "weekly",
		"2-weeks": "biweekly",
		"1-months": "monthly",
		"3-months": "quarterly",
		"6-months": "semiannual",
		"12-months": "yearly",
		"24-months": "biennial",
		"36-months": "triennial",
		"1-years": "yearly",
		"2-years": "biennial",
		"3-years": "triennial",
	}
	return match[`${every}-${unit}`] ?? `every-${every}-${unit}`
}

/** Human label for a cycle value (preset name or "Every N weeks"). */
export function cycleLabel(cycle: Cycle): string {
	const preset = PRESET_CYCLES.find((option) => option.value === cycle)
	if (preset) {
		return preset.label
	}
	const custom = parseCustomCycle(cycle)
	if (!custom) {
		return cycle
	}
	return `Every ${custom.every} ${custom.every === 1 ? custom.unit.slice(0, -1) : custom.unit}`
}

function cycleSpec(cycle: Cycle): { days: number } | { months: number } {
	const fixed: Record<PresetCycle, { days: number } | { months: number }> = {
		weekly: { days: 7 },
		biweekly: { days: 14 },
		monthly: { months: 1 },
		quarterly: { months: 3 },
		semiannual: { months: 6 },
		yearly: { months: 12 },
		biennial: { months: 24 },
		triennial: { months: 36 },
	}
	if (cycle in fixed) {
		return fixed[cycle as PresetCycle]
	}
	const custom = parseCustomCycle(cycle)
	if (!custom) {
		return { months: 1 }
	}
	return custom.unit === "weeks"
		? { days: 7 * custom.every }
		: {
				months:
					custom.unit === "months" ? custom.every : 12 * custom.every,
			}
}

/** Shift a billing date by n cycles, keeping the original day of month (clamped to short months). */
export function shiftCycle(iso: string, cycle: Cycle, n: number) {
	const spec = cycleSpec(cycle)
	if ("days" in spec) {
		return addDays(iso, spec.days * n)
	}
	const anchor = parseIso(iso)
	const target = new Date(
		anchor.getFullYear(),
		anchor.getMonth() + spec.months * n,
		1
	)
	const last = new Date(
		target.getFullYear(),
		target.getMonth() + 1,
		0
	).getDate()
	return isoDate(
		new Date(
			target.getFullYear(),
			target.getMonth(),
			Math.min(anchor.getDate(), last)
		)
	)
}
