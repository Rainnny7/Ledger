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
    id: "ocean",
    label: "Ocean",
    description: "Soft slate-navy with a misty sky-blue accent",
    dark: true,
    className: "theme-ocean",
    swatch: ["#121a23", "#18212c", "#7cc0dc"],
  },
  {
    id: "forest",
    label: "Forest",
    description: "Deep moss with a gentle sage accent",
    dark: true,
    className: "theme-forest",
    swatch: ["#141a16", "#1a211c", "#8cc9a4"],
  },
  {
    id: "mocha",
    label: "Mocha",
    description: "Roasted brown with a caramel accent",
    dark: true,
    className: "theme-mocha",
    swatch: ["#17120f", "#211a16", "#e0a87a"],
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
