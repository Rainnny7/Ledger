import { Loader2, ShieldCheck, ShieldOff } from "lucide-react"
import { CopyIcon } from "@/components/icons/copy"
import { DownloadIcon } from "@/components/icons/download"
import { REGEXP_ONLY_DIGITS } from "input-otp"
import { useState } from "react"
import { toast } from "sonner"
import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"
import { toastError } from "@/lib/toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardAction,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { QrCode } from "@/components/common/qr-code"
import { twoFactor, useSession } from "@/lib/auth-client"
import { PasswordDialog } from "@/components/settings/password-dialog"
import { useHasPassword } from "@/lib/queries"

type SetupStep =
	| { type: "password" }
	| { type: "scan"; uri: string; backupCodes: string[] }
	| { type: "codes"; backupCodes: string[] }

/** Enable or disable authenticator-app two-factor login, including backup codes. */
export function TwoFactorCard() {
	const { data } = useSession()
	const enabled = !!(
		data?.user as { twoFactorEnabled?: boolean | null } | undefined
	)?.twoFactorEnabled
	const [dialog, setDialog] = useState<null | "setup" | "disable" | "codes">(
		null
	)
	const hasPassword = useHasPassword()
	// Accounts without a password (email-link logins) are vouched for by their recent login instead.
	const requirePassword = hasPassword.data?.hasPassword !== false
	const { saved, flash } = useSavedFlash()

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Two-Factor Authentication
					<SavedIndicator saved={saved} showLabel={false} />
					{enabled ? (
						<Badge>On</Badge>
					) : (
						<Badge variant="secondary">Off</Badge>
					)}
				</CardTitle>
				<CardDescription>
					Ask for a code from an authenticator app (1Password, Google
					Authenticator, Authy…) every time you log in on a new
					device.
				</CardDescription>
				<CardAction className="flex gap-2">
					{enabled ? (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setDialog("codes")}
							>
								New backup codes
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setDialog("disable")}
							>
								<ShieldOff /> Turn off
							</Button>
						</>
					) : (
						<Button size="sm" onClick={() => setDialog("setup")}>
							<ShieldCheck /> Set up
						</Button>
					)}
				</CardAction>
			</CardHeader>
			<SetupDialog
				requirePassword={requirePassword}
				open={dialog === "setup"}
				onClose={() => setDialog(null)}
				onSaved={flash}
			/>
			<PasswordDialog
				open={dialog === "disable"}
				onClose={() => setDialog(null)}
				title="Turn off two-factor authentication?"
				description="Logging in will only need your password. Your backup codes stop working."
				action="Turn off"
				destructive
				requirePassword={requirePassword}
				run={async (password) => {
					const { error } = await twoFactor.disable(
						requirePassword
							? { password }
							: ({} as { password: string })
					)
					if (error) {
						return error.message ?? "Could not turn off 2FA"
					}
					toast.success("Two-factor authentication turned off")
					flash()
					return null
				}}
			/>
			<RegenerateCodesDialog
				requirePassword={requirePassword}
				open={dialog === "codes"}
				onClose={() => setDialog(null)}
				onSaved={flash}
			/>
		</Card>
	)
}

function SetupDialog({
	open,
	onClose,
	requirePassword,
	onSaved,
}: {
	requirePassword: boolean
	open: boolean
	onClose: () => void
	onSaved: () => void
}) {
	const [step, setStep] = useState<SetupStep>({ type: "password" })
	const [password, setPassword] = useState("")
	const [code, setCode] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)

	function reset() {
		setStep({ type: "password" })
		setPassword("")
		setCode("")
		setError(null)
	}

	async function begin(event: React.FormEvent) {
		event.preventDefault()
		setBusy(true)
		setError(null)
		try {
			const { data, error: enableError } = await twoFactor.enable(
				requirePassword ? { password } : ({} as { password: string })
			)
			if (enableError || !data || !("totpURI" in data)) {
				return setError(enableError?.message ?? "Could not start setup")
			}
			setStep({
				type: "scan",
				uri: data.totpURI,
				backupCodes: data.backupCodes,
			})
		} finally {
			setBusy(false)
			setPassword("")
		}
	}

	async function verify(value: string) {
		if (step.type !== "scan" || busy) {
			return
		}
		setBusy(true)
		setError(null)
		try {
			const { error: verifyError } = await twoFactor.verifyTotp({
				code: value,
			})
			if (verifyError) {
				setCode("")
				return setError(
					verifyError.message ??
						"That code didn’t match. Try the next one."
				)
			}
			setStep({ type: "codes", backupCodes: step.backupCodes })
			toast.success("Two-factor authentication is on")
			onSaved()
		} finally {
			setBusy(false)
		}
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				if (!isOpen) {
					onClose()
					reset()
				}
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Set Up Two-Factor Authentication</DialogTitle>
					<DialogDescription>
						{step.type === "password" &&
							(requirePassword
								? "Confirm your password to continue."
								: "Continue to get a QR code for your authenticator app.")}
						{step.type === "scan" &&
							"Scan this with your authenticator app, then enter the 6-digit code it shows."}
						{step.type === "codes" &&
							"Save these backup codes somewhere safe. Each one signs you in once if you lose your phone."}
					</DialogDescription>
				</DialogHeader>
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{step.type === "password" && (
					<form onSubmit={begin} className="grid gap-4">
						{requirePassword && (
							<div className="grid gap-2">
								<Label htmlFor="2fa-password">Password</Label>
								<Input
									id="2fa-password"
									type="password"
									autoComplete="current-password"
									value={password}
									onChange={(event) =>
										setPassword(event.target.value)
									}
									autoFocus
									required
								/>
							</div>
						)}
						<DialogFooter>
							<Button
								type="submit"
								disabled={
									busy || (requirePassword && !password)
								}
							>
								{busy && <Loader2 className="animate-spin" />}{" "}
								Continue
							</Button>
						</DialogFooter>
					</form>
				)}
				{step.type === "scan" && (
					<div className="grid justify-items-center gap-4">
						<QrCode
							value={step.uri}
							label="QR code for your authenticator app"
							className="size-48 rounded-lg p-2"
						/>
						<details className="w-full text-xs text-muted-foreground">
							<summary className="cursor-pointer">
								Can’t scan? Enter the key manually
							</summary>
							<code className="mt-2 block rounded-md bg-muted p-2 break-all text-foreground">
								{secretOf(step.uri)}
							</code>
						</details>
						<InputOTP
							maxLength={6}
							pattern={REGEXP_ONLY_DIGITS}
							autoComplete="one-time-code"
							value={code}
							onChange={setCode}
							onComplete={(enteredCode: string) =>
								void verify(enteredCode)
							}
							disabled={busy}
							autoFocus
						>
							<InputOTPGroup>
								<InputOTPSlot index={0} />
								<InputOTPSlot index={1} />
								<InputOTPSlot index={2} />
							</InputOTPGroup>
							<InputOTPSeparator />
							<InputOTPGroup>
								<InputOTPSlot index={3} />
								<InputOTPSlot index={4} />
								<InputOTPSlot index={5} />
							</InputOTPGroup>
						</InputOTP>
					</div>
				)}
				{step.type === "codes" && (
					<>
						<BackupCodes codes={step.backupCodes} />
						<DialogFooter>
							<Button
								onClick={() => {
									onClose()
									reset()
								}}
							>
								I’ve saved them
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}

function RegenerateCodesDialog({
	open,
	onClose,
	requirePassword,
	onSaved,
}: {
	requirePassword: boolean
	open: boolean
	onClose: () => void
	onSaved: () => void
}) {
	const [codes, setCodes] = useState<string[] | null>(null)
	if (codes) {
		return (
			<Dialog
				open={open}
				onOpenChange={(isOpen) => {
					if (!isOpen) {
						onClose()
						setCodes(null)
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>New Backup Codes</DialogTitle>
						<DialogDescription>
							Your old codes no longer work. Save these somewhere
							safe.
						</DialogDescription>
					</DialogHeader>
					<BackupCodes codes={codes} />
					<DialogFooter>
						<Button
							onClick={() => {
								onClose()
								setCodes(null)
							}}
						>
							Done
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		)
	}
	return (
		<PasswordDialog
			open={open}
			onClose={onClose}
			keepOpen
			title="Generate new backup codes?"
			description="Your current backup codes will stop working."
			action="Generate"
			requirePassword={requirePassword}
			run={async (password) => {
				const { data, error } = await twoFactor.generateBackupCodes(
					requirePassword
						? { password }
						: ({} as { password: string })
				)
				if (error || !data) {
					return error?.message ?? "Could not generate codes"
				}
				setCodes(data.backupCodes)
				onSaved()
				return null
			}}
		/>
	)
}

function BackupCodes({ codes }: { codes: string[] }) {
	const text = codes.join("\n")
	return (
		<div className="grid gap-3">
			<ul className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted p-3 font-mono text-sm">
				{codes.map((backupCode) => (
					<li key={backupCode}>{backupCode}</li>
				))}
			</ul>
			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() =>
						void navigator.clipboard.writeText(text).then(
							() => toast.success("Copied"),
							() => toastError("Could not copy")
						)
					}
				>
					<CopyIcon size={24} className="flex" /> Copy
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						const url = URL.createObjectURL(
							new Blob([`Ledger backup codes\n\n${text}\n`], {
								type: "text/plain",
							})
						)
						const downloadLink = document.createElement("a")
						downloadLink.href = url
						downloadLink.download = "ledger-backup-codes.txt"
						downloadLink.click()
						setTimeout(() => URL.revokeObjectURL(url), 1000)
					}}
				>
					<DownloadIcon size={24} className="flex" /> Download
				</Button>
			</div>
		</div>
	)
}

/** The base32 secret inside an otpauth:// URI, grouped in fours for typing. */
function secretOf(uri: string) {
	try {
		return (new URL(uri).searchParams.get("secret") ?? "")
			.replace(/(.{4})/g, "$1 ")
			.trim()
	} catch {
		return ""
	}
}
