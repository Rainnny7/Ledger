/** Email palette, matching Ledger's light theme (mail clients can't use CSS variables or dark mode reliably). */
export const EMAIL_COLORS = {
	page: "#f6f3ee",
	card: "#ffffff",
	text: "#1f1d24",
	muted: "#6b6672",
	border: "#e9e4dc",
	primary: "#a8680a",
	primaryForeground: "#ffffff",
	tint: "#fbf3e4",
	track: "#f1ebe0",
	good: "#15803d",
	bad: "#b91c1c",
} as const

/** Font stack for email bodies; Geist isn't installed on recipients' devices. */
export const EMAIL_FONT_FAMILY =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
