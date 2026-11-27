import { Loader2, MailCheck, MailWarning } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { authClient, useSession } from "@/lib/auth-client"
import { useAppConfig } from "@/lib/queries"
import {
	VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS,
	clearVerificationCooldownEnd,
	formatResendCountdown,
	readVerificationCooldownEnd,
	writeVerificationCooldownEnd,
} from "@/lib/verification-email-cooldown"

/** Shows verification status and resends the verify-email message when SMTP is on. */
export function EmailVerificationCard() {
	const session = useSession()
	const config = useAppConfig()
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [cooldownSeconds, setCooldownSeconds] = useState(0)
	const [localEnd, setLocalEnd] = useState<{
		userId: string
		endsAt: number
	} | null>(null)
	const { saved, flash } = useSavedFlash()
	const user = session.data?.user
	const userId = user?.id
	const persistedEnd = userId ? readVerificationCooldownEnd(userId) : null
	const endsAt =
		localEnd !== null && localEnd.userId === userId
			? localEnd.endsAt
			: persistedEnd
	const resendBlocked = cooldownSeconds > 0

	useEffect(() => {
		function syncCooldown() {
			if (!endsAt) {
				setCooldownSeconds(0)
				return
			}
			const remaining = Math.ceil((endsAt - Date.now()) / 1000)
			if (remaining <= 0) {
				if (userId) {
					clearVerificationCooldownEnd(userId)
				}
				setLocalEnd(null)
				setCooldownSeconds(0)
				return
			}
			setCooldownSeconds(remaining)
		}
		syncCooldown()
		if (!endsAt) {
			return
		}
		const timer = window.setInterval(syncCooldown, 1000)
		return () => window.clearInterval(timer)
	}, [endsAt, userId])

	if (!user) {
		return null
	}
	const emailLinks = config?.emailLinks === true
	if (user.emailVerified) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Email address</CardTitle>
					<CardDescription>
						{user.email} is verified on this Ledger.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
					<MailCheck className="size-4 text-green-600" aria-hidden />
					Verified
				</CardContent>
			</Card>
		)
	}

	function startCooldownWindow(
		durationSeconds = VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS
	) {
		if (!userId) {
			return
		}
		const cooldownEndsAt = Date.now() + durationSeconds * 1000
		writeVerificationCooldownEnd(userId, cooldownEndsAt)
		setLocalEnd({ userId, endsAt: cooldownEndsAt })
	}

	async function sendVerification() {
		const email = user?.email
		if (!email || !emailLinks || busy || resendBlocked) {
			return
		}
		setBusy(true)
		setError(null)
		try {
			const { error: sendError } = await authClient.sendVerificationEmail(
				{
					email,
					callbackURL: "/email-verified",
				}
			)
			if (sendError) {
				const code =
					typeof sendError === "object" &&
					sendError !== null &&
					"code" in sendError
						? String((sendError as { code?: unknown }).code)
						: ""
				if (code === "VERIFICATION_EMAIL_COOLDOWN") {
					const match = sendError.message?.match(/(\d+)\s+seconds/)
					const seconds = match
						? Number(match[1])
						: VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS
					startCooldownWindow(
						Number.isFinite(seconds)
							? seconds
							: VERIFICATION_EMAIL_RESEND_COOLDOWN_SECONDS
					)
					setError(
						sendError.message ?? "Please wait before resending."
					)
					return
				}
				setError(
					sendError.message ?? "Could not send verification email"
				)
				return
			}
			startCooldownWindow()
			toast.success("Check your inbox for a verification link")
			flash()
		} finally {
			setBusy(false)
		}
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle>Email address</CardTitle>
				<CardDescription>
					{user.email} is not verified yet. Verify it so email login
					links work if you also use a password.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				{error ? (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<MailWarning
						className="size-4 text-amber-600"
						aria-hidden
					/>
					Not verified
				</div>
				{emailLinks ? (
					<div className="flex w-fit items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={busy || resendBlocked}
							onClick={() => void sendVerification()}
						>
							{busy && <Loader2 className="animate-spin" />}
							{resendBlocked
								? `Resend in ${formatResendCountdown(cooldownSeconds)}`
								: "Send verification email"}
						</Button>
						<SavedIndicator saved={saved} showLabel={false} />
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						This server has not set up outbound email. Ask an admin
						to configure SMTP to verify your address.
					</p>
				)}
			</CardContent>
		</Card>
	)
}
