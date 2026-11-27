/**
 * Appearance: a mode (System / Light / Dark / AMOLED) and an accent colour, chosen independently.
 * next-themes keeps the mode in this browser and sets its class on <html> before the first paint;
 * the accent is kept in localStorage ("accent") and set as an `accent-*` class on <html> the same
 * way (see themeBoot in vite.config.ts). Both are also saved to the account (Settings → Appearance)
 * so they follow you to every device you log in on.
 */
import { useTheme } from "next-themes"
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
import { flushSync } from "react-dom"
import { toastError } from "@/lib/toast"
import {
	ACCENTS,
	accentClassName,
	DEFAULT_ACCENT,
	isAccent,
	isThemeMode,
	MODES,
	modeMeta,
	type AccentId,
	type ModeChoice,
	type ModeId,
} from "@ledger/shared/themes"
import { authClient, useSession } from "./auth-client.ts"
import { demoMode } from "./demo.ts"

export { ACCENTS, MODES, type AccentId, type ModeChoice, type ModeId }
export { MODE_CLASSES } from "./theme-classes.ts"

const ACCENT_STORAGE_KEY = "accent"

const reducedMotion = () =>
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

const systemMode = (): ModeId =>
	matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

/** Puts the mode's class on <html> before the next paint. */
function applyModeClass(choice: ModeChoice) {
	const id = choice === "system" ? systemMode() : choice
	const root = document.documentElement
	root.classList.remove(...MODES.map((mode) => mode.className))
	root.classList.add(modeMeta(id)!.className)
}

/** Puts the accent's class on <html>, replacing the previous accent's. */
function applyAccentClass(accent: AccentId) {
	const root = document.documentElement
	root.classList.remove(...ACCENTS.map((entry) => accentClassName(entry.id)))
	root.classList.add(accentClassName(accent))
}

const accentListeners = new Set<() => void>()

/** The accent kept in this browser, or the default when none is saved or the value is unknown. */
function readAccent(): AccentId {
	try {
		const stored = localStorage.getItem(ACCENT_STORAGE_KEY)
		return isAccent(stored) ? stored : DEFAULT_ACCENT
	} catch {
		return DEFAULT_ACCENT
	}
}

/** Keeps the accent in this browser, applies it and tells every subscribed component. */
function storeAccent(accent: AccentId) {
	try {
		localStorage.setItem(ACCENT_STORAGE_KEY, accent)
	} catch {
		// Storage can be blocked; the accent still applies for this visit.
	}
	applyAccentClass(accent)
	accentListeners.forEach((listener) => listener())
}

/** Subscribes to accent changes made here or in another tab. */
function subscribeToAccent(onChange: () => void) {
	const onStorage = (event: StorageEvent) => {
		if (event.key === ACCENT_STORAGE_KEY) {
			applyAccentClass(readAccent())
			onChange()
		}
	}
	accentListeners.add(onChange)
	window.addEventListener("storage", onStorage)
	return () => {
		accentListeners.delete(onChange)
		window.removeEventListener("storage", onStorage)
	}
}

/** How many theme view transitions are still animating. */
let runningThemeTransitions = 0

/**
 * Whether an overlay (dialog, menu) should stay open despite this close request. While a theme change
 * animates, the browser's transition overlay covers the page and swallows clicks, so a click on the
 * overlay itself (a double click on a theme option, say) reads as a press outside it. Those requests
 * are cancelled here so changing the theme from inside an overlay can't close it.
 *
 * @param open - The open state the overlay is asked to move to.
 * @param eventDetails - Base UI's change details: why it's closing, and a way to cancel it.
 * @returns True when the request was cancelled and the caller should ignore it.
 */
export function keepOpenDuringThemeTransition(
	open: boolean,
	eventDetails: { reason: string; cancel: () => void }
) {
	if (
		open ||
		runningThemeTransitions === 0 ||
		(eventDetails.reason !== "outside-press" &&
			eventDetails.reason !== "focus-out")
	) {
		return false
	}
	eventDetails.cancel()
	return true
}

/**
 * Runs `apply`. Where supported, the change spreads out in a circle from `from` instead of swapping
 * in at once. Reveal geometry and a `theme-transition` class on <html> drive the CSS animation on
 * `::view-transition-new(root)` (see index.css).
 */
async function applyWithTransition(apply: () => void, from?: Element | null) {
	// Measured now: a menu item may be gone by the time the transition starts.
	const origin = from?.getBoundingClientRect()
	if (!origin || reducedMotion() || !("startViewTransition" in document)) {
		apply()
		return
	}
	const x = origin.left + origin.width / 2
	const y = origin.top + origin.height / 2
	const radius = Math.hypot(
		Math.max(x, innerWidth - x),
		Math.max(y, innerHeight - y)
	)
	const root = document.documentElement
	root.style.setProperty("--theme-reveal-x", `${x}px`)
	root.style.setProperty("--theme-reveal-y", `${y}px`)
	root.style.setProperty("--theme-reveal-radius", `${radius}px`)
	root.classList.add("theme-transition")
	const transition = document.startViewTransition(apply)
	runningThemeTransitions++
	try {
		await transition.finished
	} finally {
		runningThemeTransitions--
		if (runningThemeTransitions === 0) {
			root.classList.remove("theme-transition")
			root.style.removeProperty("--theme-reveal-x")
			root.style.removeProperty("--theme-reveal-y")
			root.style.removeProperty("--theme-reveal-radius")
		}
	}
}

/**
 * The current mode and accent, and setters for each. `from` is the element a change came from:
 * where supported, the change spreads out from it in a circle.
 */
export function useAppTheme() {
	const { theme, resolvedTheme, setTheme } = useTheme()
	const { data } = useSession()
	const mode: ModeChoice = isThemeMode(theme) ? theme : "system"
	const resolved = modeMeta(resolvedTheme) ?? MODES[0]
	const accent = useSyncExternalStore(
		subscribeToAccent,
		readAccent,
		() => DEFAULT_ACCENT
	)

	const signedIn = Boolean(data)

	/** Saves to the account too (not in demo mode: that's a look around, not your account). */
	const saveToAccount = useCallback(
		async (
			changes: { theme: ModeChoice } | { accent: AccentId }
		): Promise<boolean> => {
			if (!signedIn || demoMode) {
				return true
			}
			const { error } = await authClient.updateUser(changes)
			if (error) {
				toastError(error.message ?? "Couldn’t save your appearance")
				return false
			}
			return true
		},
		[signedIn]
	)

	const changeMode = useCallback(
		async (next: ModeChoice, from?: Element | null): Promise<boolean> => {
			if (next === mode) {
				return true
			}
			await applyWithTransition(
				() =>
					flushSync(() => {
						applyModeClass(next)
						setTheme(next)
					}),
				from
			)
			return saveToAccount({ theme: next })
		},
		[mode, saveToAccount, setTheme]
	)

	const changeAccent = useCallback(
		async (next: AccentId, from?: Element | null): Promise<boolean> => {
			if (next === accent) {
				return true
			}
			await applyWithTransition(
				() => flushSync(() => storeAccent(next)),
				from
			)
			return saveToAccount({ accent: next })
		},
		[accent, saveToAccount]
	)

	return { mode, resolved, accent, changeMode, changeAccent }
}

/**
 * On login, picks up the mode and accent saved to the account (chosen on another device), once
 * per session. Changes made here afterwards are saved by useAppTheme.
 */
export function useAccountTheme() {
	const { data } = useSession()
	const { theme, setTheme } = useTheme()
	const saved = data?.user as
		| { theme?: string | null; accent?: string | null }
		| undefined
	const savedMode = saved?.theme
	const savedAccent = saved?.accent
	const synced = useRef<string | null>(null)
	const userId = data?.user.id ?? null

	useEffect(() => {
		if (demoMode || !userId || synced.current === userId) {
			return
		}
		synced.current = userId
		if (isThemeMode(savedMode) && savedMode !== theme) {
			setTheme(savedMode)
		}
		if (isAccent(savedAccent) && savedAccent !== readAccent()) {
			storeAccent(savedAccent)
		}
	}, [userId, savedMode, savedAccent, theme, setTheme])
}
