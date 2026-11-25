/**
 * Password rules, shared by the sign-up / change-password forms and the server (which enforces them,
 * so a request that skips the form can't set a weak password).
 */

export const PASSWORD_MIN = 10
/** Upper bound so hashes and forms stay reasonable. */
export const PASSWORD_MAX = 128

/** Rules enforced on sign-up and password change. */
export const PASSWORD_RULES: {
	id: string
	label: string
	test: (password: string) => boolean
}[] = [
	{
		id: "length",
		label: `At least ${PASSWORD_MIN} characters`,
		test: (password) => password.length >= PASSWORD_MIN,
	},
	{
		id: "lower",
		label: "A lowercase letter",
		test: (password) => /\p{Ll}/u.test(password),
	},
	{
		id: "upper",
		label: "An uppercase letter",
		test: (password) => /\p{Lu}/u.test(password),
	},
	{
		id: "number",
		label: "A number",
		test: (password) => /\p{Nd}/u.test(password),
	},
	{
		id: "symbol",
		label: "A symbol, like ! # $ or %",
		test: (password) => /[^\p{L}\p{Nd}\s]/u.test(password),
	},
]

/** Each rule and whether the password meets it. */
export function checkPassword(password: string) {
	return PASSWORD_RULES.map((rule) => ({
		id: rule.id,
		label: rule.label,
		ok: rule.test(password),
	}))
}

/** Whether the password meets every rule and fits within PASSWORD_MAX. */
export function isStrongPassword(password: string) {
	return (
		password.length <= PASSWORD_MAX &&
		PASSWORD_RULES.every((rule) => rule.test(password))
	)
}

/** A one-line reason the password isn't accepted, or null when it is. */
export function passwordProblem(password: string): string | null {
	if (password.length > PASSWORD_MAX) {
		return `Use at most ${PASSWORD_MAX} characters.`
	}
	const missing = PASSWORD_RULES.filter((rule) => !rule.test(password))
	if (missing.length === 0) {
		return null
	}
	return `Your password needs ${missing
		.map((rule) => rule.label.charAt(0).toLowerCase() + rule.label.slice(1))
		.join(", ")}.`
}
