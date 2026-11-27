/** Seconds between verification resends in Settings (matches the server cooldown). */
export const VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS = 60

const STORAGE_PREFIX = "ledger.verification-email-cooldown."

/** localStorage key for when the resend button may be used again. */
export function verificationEmailCooldownStorageKey(userId: string) {
	return `${STORAGE_PREFIX}${userId}`
}

/** Formats whole seconds left as `M:SS` for the resend label. */
export function formatResendCountdown(totalSeconds: number) {
	const clamped = Math.max(0, totalSeconds)
	const minutes = Math.floor(clamped / 60)
	const seconds = clamped % 60
	return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

/** Reads a persisted cooldown end timestamp, or null when unset or invalid. */
export function readVerificationCooldownEnd(userId: string): number | null {
	try {
		const raw = localStorage.getItem(
			verificationEmailCooldownStorageKey(userId)
		)
		if (!raw) {
			return null
		}
		const parsed = Number(raw)
		return Number.isFinite(parsed) ? parsed : null
	} catch {
		return null
	}
}

/** Persists when the resend button may be used again. */
export function writeVerificationCooldownEnd(userId: string, endsAt: number) {
	try {
		localStorage.setItem(
			verificationEmailCooldownStorageKey(userId),
			String(endsAt)
		)
	} catch {
		// ignore quota / private mode
	}
}

/** Clears a finished cooldown from storage. */
export function clearVerificationCooldownEnd(userId: string) {
	try {
		localStorage.removeItem(verificationEmailCooldownStorageKey(userId))
	} catch {
		// ignore
	}
}
