import { MODES } from "@ledger/shared/themes"

/** For next-themes: each mode's name → the class it puts on <html>. */
export const MODE_CLASSES: Record<string, string> = Object.fromEntries(
	MODES.map((mode) => [mode.id, mode.className])
)
