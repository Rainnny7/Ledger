import { isStrongPassword } from "@/components/common/password-rules"

export function userInitials(u: { name?: string; email?: string }) {
  return (u.name || u.email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

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
    const bytes = Array.from(crypto.getRandomValues(new Uint8Array(32))).filter(
      (b) => b < 256 - (256 % alphabet.length)
    )
    const pw = bytes
      .slice(0, 14)
      .map((b) => alphabet[b % alphabet.length])
      .join("")
    if (pw.length === 14 && isStrongPassword(pw)) return pw
  }
}

export async function copyPassword(password: string) {
  try {
    await navigator.clipboard.writeText(password)
    return true
  } catch {
    return false
  }
}
