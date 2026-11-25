import { isStrongPassword } from "@/components/common/password-rules"

/** Two-letter initials from a display name or email. */
export function userInitials(user: { name?: string; email?: string }) {
	return (user.name || user.email || "?")
		.split(/\s+/)
		.map((part) => part[0])
		.slice(0, 2)
		.join("")
		.toUpperCase()
}

/** Locale-aware medium date for join timestamps. */
export const userJoined = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
})

/**
 * 14 easy-to-read characters (no 0/O or 1/l/I), for passwords you'll read out or paste to someone.
 * Drawn until it meets the password rules (a symbol and a digit usually turn up in a draw or two).
 */
export function randomPassword() {
	const alphabet =
		"abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!#$%&*+-=?@"
	for (;;) {
		// Bytes past the last whole multiple of the alphabet's length are dropped, so every character is equally likely.
		const bytes = Array.from(
			crypto.getRandomValues(new Uint8Array(32))
		).filter((byte) => byte < 256 - (256 % alphabet.length))
		const pw = bytes
			.slice(0, 14)
			.map((byte) => alphabet[byte % alphabet.length])
			.join("")
		if (pw.length === 14 && isStrongPassword(pw)) {
			return pw
		}
	}
}

/** Copy a password string to the clipboard; returns whether it succeeded. */
export async function copyPassword(password: string) {
	try {
		await navigator.clipboard.writeText(password)
		return true
	} catch {
		return false
	}
}
