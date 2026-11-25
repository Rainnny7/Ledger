/**
 * Colour themes. next-themes keeps the choice in this browser and sets the theme's class on <html>
 * before the first paint; the choice is also saved to the account (Settings → Appearance) so it
 * follows you to every device you sign in on.
 */
import { useTheme } from "next-themes"
import { useCallback, useEffect, useRef } from "react"
import { flushSync } from "react-dom"
import { toastError } from "@/lib/toast"
import {
	isThemeChoice,
	type ThemeChoice,
	type ThemeId,
	THEMES,
	themeMeta,
} from "@ledger/shared/themes"
import { authClient, useSession } from "./auth-client.ts"
import { demoMode } from "./demo.ts"

export { THEMES, type ThemeChoice, type ThemeId, themeMeta }
export { THEME_CLASSES } from "./theme-classes.ts"

const reducedMotion = () =>
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

const systemTheme = (): ThemeId =>
	matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

/** Puts the theme's class on <html> before the next paint. */
function applyClass(choice: ThemeChoice) {
	const id = choice === "system" ? systemTheme() : choice
	const root = document.documentElement
	root.classList.remove(...THEMES.map((theme) => theme.className))
	root.classList.add(themeMeta(id)!.className)
}

/**
 * The current theme and a setter. `from` is the element the change came from: where supported, the
 * new theme spreads out from it in a circle instead of swapping in at once.
 */
export function useAppTheme() {
	const { theme, resolvedTheme, setTheme } = useTheme()
	const { data } = useSession()
	const choice: ThemeChoice = isThemeChoice(theme) ? theme : "system"
	const resolved = themeMeta(resolvedTheme) ?? THEMES[0]

	const signedIn = Boolean(data)
	const change = useCallback(
		async (next: ThemeChoice, from?: Element | null) => {
			if (next === choice) {
				return
			}
			// Measured now: a menu item may be gone by the time the transition starts.
			const origin = from?.getBoundingClientRect()
			const apply = () =>
				flushSync(() => {
					applyClass(next)
					setTheme(next)
				})

			// Saved to the account too (not in demo mode: that's a look around, not your account).
			if (signedIn && !demoMode) {
				void authClient
					.updateUser({ theme: next })
					.then(({ error }) => {
						if (error) {
							toastError(
								error.message ?? "Couldn’t save your theme"
							)
						}
					})
			}

			if (
				!origin ||
				reducedMotion() ||
				!("startViewTransition" in document)
			) {
				apply()
				return
			}
			await document.startViewTransition(apply).ready
			const x = origin.left + origin.width / 2
			const y = origin.top + origin.height / 2
			const radius = Math.hypot(
				Math.max(x, innerWidth - x),
				Math.max(y, innerHeight - y)
			)
			document.documentElement.animate(
				{
					clipPath: [
						`circle(0px at ${x}px ${y}px)`,
						`circle(${radius}px at ${x}px ${y}px)`,
					],
				},
				{
					duration: 450,
					easing: "ease-in-out",
					pseudoElement: "::view-transition-new(root)",
				}
			)
		},
		[choice, signedIn, setTheme]
	)

	return { choice, resolved, change }
}

/**
 * On sign-in, picks up the theme saved to the account (chosen on another device), once per session.
 * Changes made here afterwards are saved by useAppTheme.
 */
export function useAccountTheme() {
	const { data } = useSession()
	const { theme, setTheme } = useTheme()
	const saved = (data?.user as { theme?: string | null } | undefined)?.theme
	const synced = useRef<string | null>(null)
	const userId = data?.user.id ?? null

	useEffect(() => {
		if (demoMode || !userId || synced.current === userId) {
			return
		}
		synced.current = userId
		if (isThemeChoice(saved) && saved !== theme) {
			setTheme(saved)
		}
	}, [userId, saved, theme, setTheme])
}
