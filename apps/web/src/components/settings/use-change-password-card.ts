import { useState } from "react"
import { toast } from "sonner"
import { useSavedFlash } from "@/components/common/saved-indicator"
import { isStrongPassword } from "@/components/common/password-rules"
import { useNavigate } from "@tanstack/react-router"
import { authClient, signOut } from "@/lib/auth-client"
import { queryClient, useHasPassword } from "@/lib/queries"

/**
 * Change-password card form state and submit handlers.
 */
export function useChangePasswordCard() {
	const navigate = useNavigate()
	const hasPassword = useHasPassword()
	const [current, setCurrent] = useState("")
	const [next, setNext] = useState("")
	const [confirm, setConfirm] = useState("")
	const [signOutOthers, setSignOutOthers] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [needsRelogin, setNeedsRelogin] = useState(false)
	const [busy, setBusy] = useState(false)
	const { saved, flash } = useSavedFlash()

	const passwordless = hasPassword.data?.hasPassword === false
	const mismatch = confirm.length > 0 && next !== confirm
	const sameAsOld = next.length > 0 && next === current
	const changeValid =
		current.length > 0 &&
		isStrongPassword(next) &&
		next === confirm &&
		!sameAsOld
	const setValid = isStrongPassword(next) && next === confirm

	async function submitChange(event: React.FormEvent) {
		event.preventDefault()
		if (!changeValid) {
			return
		}
		setBusy(true)
		setError(null)
		try {
			const { error: authError } = await authClient.changePassword({
				currentPassword: current,
				newPassword: next,
				revokeOtherSessions: signOutOthers,
			})
			if (authError) {
				setError(
					authError.code === "INVALID_PASSWORD"
						? "Your current password is wrong."
						: (authError.message ??
								"Could not change your password")
				)
				return
			}
			setCurrent("")
			setNext("")
			setConfirm("")
			toast.success(
				signOutOthers
					? "Password changed. Other devices were logged out."
					: "Password changed"
			)
			flash()
			void queryClient.invalidateQueries({
				queryKey: ["auth", "sessions"],
			})
		} finally {
			setBusy(false)
		}
	}

	async function submitSet(event: React.FormEvent) {
		event.preventDefault()
		if (!setValid) {
			return
		}
		setBusy(true)
		setError(null)
		setNeedsRelogin(false)
		try {
			const response = await fetch("/api/auth/password/set", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					newPassword: next,
					revokeOtherSessions: signOutOthers,
				}),
			})
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					message?: string
					code?: string
				} | null
				if (body?.code === "RECENT_LOGIN_REQUIRED") {
					setNeedsRelogin(true)
					setError(
						body.message ??
							"For your security, log in again with an email link first."
					)
					return
				}
				setError(body?.message ?? "Could not set your password")
				return
			}
			setNext("")
			setConfirm("")
			toast.success(
				signOutOthers
					? "Password set. Other devices were logged out."
					: "Password set"
			)
			flash()
			void queryClient.invalidateQueries({
				queryKey: ["auth", "has-password"],
			})
			void queryClient.invalidateQueries({
				queryKey: ["auth", "sessions"],
			})
		} catch {
			setError(
				"Could not reach the server. Check your connection and try again."
			)
		} finally {
			setBusy(false)
		}
	}

	function requestRelogin() {
		void signOut({
			fetchOptions: {
				onSuccess: () => {
					void navigate({
						to: "/login",
						replace: true,
					})
				},
			},
		})
	}

	return {
		hasPassword,
		passwordless,
		current,
		setCurrent,
		next,
		setNext,
		confirm,
		setConfirm,
		signOutOthers,
		setSignOutOthers,
		error,
		needsRelogin,
		busy,
		saved,
		mismatch,
		sameAsOld,
		changeValid,
		setValid,
		submitChange,
		submitSet,
		requestRelogin,
	}
}
