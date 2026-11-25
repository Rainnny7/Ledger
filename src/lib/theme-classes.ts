import { THEMES } from "../../shared/themes.ts"

/** For next-themes: each theme's name → the class it puts on <html>. */
export const THEME_CLASSES: Record<string, string> = Object.fromEntries(
	THEMES.map((theme) => [theme.id, theme.className])
)
