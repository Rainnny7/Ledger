/**
 * The app's colour themes, shared by the theme picker and the server (which checks a saved theme is
 * one of these). Each theme's colours live in src/index.css under its class.
 *
 * "light" and "dark" keep next-themes' own names so "Match system" switches between them, and so a
 * choice saved in this browser before there were more themes still applies ("dark" is Sunset).
 */
export const THEMES = [
  {
    id: "light",
    label: "Light",
    description: "Bright and warm, with a dusty-rose accent",
    dark: false,
    className: "light",
    swatch: ["#fbfaf9", "#ffffff", "#b8466f"],
  },
  {
    id: "linen",
    label: "Linen",
    description: "Soft paper tones and a terracotta accent",
    dark: false,
    className: "theme-linen",
    swatch: ["#f4efe6", "#fbf8f2", "#b0532e"],
  },
  {
    id: "sage",
    label: "Sage",
    description: "Pale green-grey with a muted leaf accent",
    dark: false,
    className: "theme-sage",
    swatch: ["#f1f4ef", "#fafcf8", "#4d7a5d"],
  },
  {
    id: "dark",
    label: "Sunset",
    description: "The original dark theme: deep plum with rose",
    dark: true,
    className: "dark",
    swatch: ["#111013", "#1a181d", "#f08fb3"],
  },
  {
    id: "slate",
    label: "Slate",
    description: "Cool graphite with a periwinkle accent",
    dark: true,
    className: "theme-slate",
    swatch: ["#15181c", "#1c2026", "#93abd9"],
  },
  {
    id: "dusk",
    label: "Dusk",
    description: "Twilight indigo with a lavender accent",
    dark: true,
    className: "theme-dusk",
    swatch: ["#16131f", "#1e1a2a", "#b9a3f5"],
  },
  {
    id: "amber",
    label: "Amber",
    description: "Sunset's plum-black with a warm amber accent",
    dark: true,
    className: "theme-amber",
    swatch: ["#111013", "#1a181d", "#f0b35f"],
  },
  {
    id: "coral",
    label: "Coral",
    description: "Sunset's plum-black with a bright coral accent",
    dark: true,
    className: "theme-coral",
    swatch: ["#111013", "#1a181d", "#f48c7a"],
  },
  {
    id: "mint",
    label: "Mint",
    description: "Sunset's plum-black with a fresh mint accent",
    dark: true,
    className: "theme-mint",
    swatch: ["#111013", "#1a181d", "#7fd4b4"],
  },
  {
    id: "sky",
    label: "Sky",
    description: "Sunset's plum-black with a clear sky-blue accent",
    dark: true,
    className: "theme-sky",
    swatch: ["#111013", "#1a181d", "#7db8f2"],
  },
  {
    id: "lilac",
    label: "Lilac",
    description: "Sunset's plum-black with a soft lilac accent",
    dark: true,
    className: "theme-lilac",
    swatch: ["#111013", "#1a181d", "#b9a0f4"],
  },
  {
    id: "amoled",
    label: "AMOLED",
    description: "True black, easiest on OLED screens at night",
    dark: true,
    className: "theme-amoled",
    swatch: ["#000000", "#0a0a0a", "#f08fb3"],
  },
] as const

export type ThemeId = (typeof THEMES)[number]["id"]
/** A theme, or "system" to follow the device between Light and Sunset. */
export type ThemeChoice = ThemeId | "system"

export const THEME_IDS = THEMES.map((t) => t.id) as ThemeId[]

export const isThemeChoice = (v: unknown): v is ThemeChoice =>
  v === "system" ||
  (typeof v === "string" && (THEME_IDS as string[]).includes(v))

export const themeMeta = (id: string | undefined) =>
  THEMES.find((t) => t.id === id)
