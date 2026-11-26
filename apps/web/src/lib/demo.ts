/**
 * Demo mode swaps every bank/finance request for a made-up dataset (the server's demo user), so the
 * app can be shown off without real balances on screen. It's a per-browser switch; toggling it
 * reloads so nothing from the other mode lingers in memory.
 */
import { useSyncExternalStore } from "react"

const KEY = "ledger:demo"
const PREFS_KEY = "ledger:demo-prefs"

/** The made-up people to browse as. Keep the ids in step with the server's PERSONAS. */
export const DEMO_PERSONAS = [
	{
		id: "student",
		name: "Jordan Lee",
		label: "Student",
		blurb: "Part-time barista, about $17k a year",
		currency: "CAD",
	},
	{
		id: "average",
		name: "Alex Morgan",
		label: "Average earner",
		blurb: "Salaried, about $57k a year, plus freelance on the side",
		currency: "CAD",
	},
	{
		id: "executive",
		name: "Morgan Ellis",
		label: "High earner",
		blurb: "Senior director, about $170k a year, with a mortgage",
		currency: "CAD",
	},
	{
		id: "musk",
		name: "Elon Musk",
		label: "Billionaire",
		blurb: "Jets, rockets and a Cybertruck or two",
		currency: "USD",
	},
] as const

/** One of the built-in demo personas selectable in demo mode. */
export type DemoPersona = (typeof DEMO_PERSONAS)[number]

const DEFAULT_PERSONA = "average"

/** The saved persona id, or null when demo mode is off. "1" is what the plain on/off switch used to store. */
function read(): string | null {
	try {
		const stored = localStorage.getItem(KEY)
		if (!stored) {
			return null
		}
		return DEMO_PERSONAS.some((persona) => persona.id === stored)
			? stored
			: DEFAULT_PERSONA
	} catch {
		return null
	}
}

const personaId = read()
/** Whether this browser is browsing with fake data instead of a real account. */
export const demoMode = personaId !== null
/** Which persona demo mode is showing (the default one outside demo mode). */
export const demoPersona: DemoPersona =
	DEMO_PERSONAS.find((persona) => persona.id === personaId) ??
	DEMO_PERSONAS.find((persona) => persona.id === DEFAULT_PERSONA)!

/** Shown when something would be saved in demo mode. Forms still open so the app can be explored. */
export const DEMO_READ_ONLY =
	"Demo mode is read-only. Exit demo mode to make changes."

/** The made-up person shown instead of the logged-in user while in demo mode. */
export const DEMO_IDENTITY = {
	name: demoPersona.name,
	email: `${demoPersona.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
}

/**
 * Preferences changed while in demo mode. They stay in this browser only (never saved to the
 * account) and are thrown away when demo mode is turned on or off.
 */
export interface DemoPrefs {
	currency?: string
	includeOverdraft?: boolean
}

function readPrefs(): DemoPrefs {
	if (!demoMode) {
		return {}
	}
	try {
		return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as DemoPrefs
	} catch {
		return {}
	}
}

let prefs = readPrefs()
const listeners = new Set<() => void>()

/** Merge demo-only UI prefs into localStorage while demo mode is on. */
export function setDemoPrefs(patch: DemoPrefs) {
	prefs = { ...prefs, ...patch }
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
	} catch {
		// Storage blocked: the change still applies until the page reloads.
	}
	for (const listener of listeners) {
		listener()
	}
}

const subscribe = (listener: () => void) => {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/** The demo-mode preference overrides (empty outside demo mode). */
export const useDemoPrefs = () => useSyncExternalStore(subscribe, () => prefs)

/** Turn demo mode on as a persona (the default when none is given), or off. */
export function setDemoMode(
	enabled: boolean,
	persona: string = DEFAULT_PERSONA
) {
	try {
		localStorage.removeItem(PREFS_KEY)
		if (enabled) {
			localStorage.setItem(KEY, persona)
			// Start in the persona's own currency so a billionaire's balances aren't converted.
			const currency = DEMO_PERSONAS.find(
				(personaOption) => personaOption.id === persona
			)?.currency
			if (currency) {
				localStorage.setItem(PREFS_KEY, JSON.stringify({ currency }))
			}
		} else {
			localStorage.removeItem(KEY)
		}
	} catch {
		// Storage blocked: nothing to persist, and the reload below keeps the current mode.
	}
	// A full reload drops everything cached from the other mode.
	window.location.assign("/")
}
