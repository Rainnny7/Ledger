/**
 * Password rules, shared by the sign-up / change-password forms and the server (which enforces them,
 * so a request that skips the form can't set a weak password).
 */

export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

export const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN} characters`, test: (pw) => pw.length >= PASSWORD_MIN },
  { id: 'lower', label: 'A lowercase letter', test: (pw) => /\p{Ll}/u.test(pw) },
  { id: 'upper', label: 'An uppercase letter', test: (pw) => /\p{Lu}/u.test(pw) },
  { id: 'number', label: 'A number', test: (pw) => /\p{Nd}/u.test(pw) },
  { id: 'symbol', label: 'A symbol, like ! # $ or %', test: (pw) => /[^\p{L}\p{Nd}\s]/u.test(pw) },
]

/** Each rule and whether the password meets it. */
export function checkPassword(pw: string) {
  return PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(pw) }))
}

export function isStrongPassword(pw: string) {
  return pw.length <= PASSWORD_MAX && PASSWORD_RULES.every((r) => r.test(pw))
}

/** A one-line reason the password isn't accepted, or null when it is. */
export function passwordProblem(pw: string): string | null {
  if (pw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`
  const missing = PASSWORD_RULES.filter((r) => !r.test(pw))
  if (missing.length === 0) return null
  return `Your password needs ${missing.map((r) => r.label.charAt(0).toLowerCase() + r.label.slice(1)).join(', ')}.`
}
