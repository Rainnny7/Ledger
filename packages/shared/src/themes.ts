/**
 * The app's appearance, as two independent choices shared by the pickers and the server (which
 * checks saved values): a mode (surfaces) and an accent colour. The mode's surface colours live in
 * src/index.css under its class and each accent's colours under its `accent-*` class, both set on
 * <html>.
 *
 * "light" and "dark" keep next-themes' own names so "System" switches between them.
 */
export const MODES = [
	{
		id: "light",
		label: "Light",
		description: "Bright and warm",
		dark: false,
		className: "light",
		swatch: ["#fbfaf9", "#ffffff"],
	},
	{
		id: "dark",
		label: "Dark",
		description: "Deep plum-black, easy on the eyes",
		dark: true,
		className: "dark",
		swatch: ["#111013", "#1a181d"],
	},
	{
		id: "amoled",
		label: "AMOLED",
		description: "True black, easiest on OLED screens at night",
		dark: true,
		className: "theme-amoled",
		swatch: ["#000000", "#0a0a0a"],
	},
] as const

/** A concrete mode id saved in prefs and validated on the server. */
export type ModeId = (typeof MODES)[number]["id"]
/** A mode, or "system" to follow the device between Light and Dark. */
export type ModeChoice = ModeId | "system"

/** All concrete mode ids (excludes `system`). */
export const MODE_IDS = MODES.map((mode) => mode.id) as ModeId[]

/** Saved mode id or `system`, for prefs and server validation. */
export const isThemeMode = (value: unknown): value is ModeChoice =>
	value === "system" ||
	(typeof value === "string" && (MODE_IDS as string[]).includes(value))

/** Mode record for a saved id, if it is one of the built-in modes. */
export const modeMeta = (id: string | undefined) =>
	MODES.find((mode) => mode.id === id)

/**
 * The accent colours. `light` is the primary colour on the Light mode (darker, so text and buttons
 * stay readable on white); `dark` is the one on Dark and AMOLED (lighter, to glow on black).
 */
export const ACCENTS = [
	{ id: "rose", label: "Rose", light: "#b8466f", dark: "#f08fb3" },
	{ id: "terracotta", label: "Terracotta", light: "#b0532e", dark: "#e8946e" },
	{ id: "sage", label: "Sage", light: "#4d7a5d", dark: "#8fc2a0" },
	{ id: "periwinkle", label: "Periwinkle", light: "#4f6fb0", dark: "#93abd9" },
	{ id: "lavender", label: "Lavender", light: "#7556c9", dark: "#b9a3f5" },
	{ id: "amber", label: "Amber", light: "#a8680a", dark: "#f0b35f" },
	{ id: "coral", label: "Coral", light: "#c4503f", dark: "#f48c7a" },
	{ id: "mint", label: "Mint", light: "#1f8a68", dark: "#7fd4b4" },
	{ id: "sky", label: "Sky", light: "#1d70b8", dark: "#7db8f2" },
] as const

/** Accent id saved in prefs and validated on the server. */
export type AccentId = (typeof ACCENTS)[number]["id"]

/** The accent used until one is picked. */
export const DEFAULT_ACCENT: AccentId = "rose"

/** All accent ids. */
export const ACCENT_IDS = ACCENTS.map((accent) => accent.id) as AccentId[]

/** Whether a saved value is a known accent id, for prefs and server validation. */
export const isAccent = (value: unknown): value is AccentId =>
	typeof value === "string" && (ACCENT_IDS as string[]).includes(value)

/** Accent record for a saved id, if it is one of the built-in accents. */
export const accentMeta = (id: string | undefined) =>
	ACCENTS.find((accent) => accent.id === id)

/** The class an accent puts on <html>. */
export const accentClassName = (id: AccentId) => `accent-${id}`
