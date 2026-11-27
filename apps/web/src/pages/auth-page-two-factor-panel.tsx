import { Reveal } from "@/components/auth/reveal"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { useAuthPage } from "@/pages/use-auth-page"

type AuthState = ReturnType<typeof useAuthPage>

/** Two-factor and backup-code step on the login card. */
export function AuthPageTwoFactorPanel({ auth }: { auth: AuthState }) {
	const {
		step,
		code,
		setCode,
		useBackup,
		setUseBackup,
		trustDevice,
		setTrustDevice,
		pending,
		setProblem,
		codeRef,
		edited,
		verifyCode,
	} = auth

	return (
		<Reveal open={step === "code"} spaced={false}>
			<div className="grid gap-2">
				<Label htmlFor="code">
					{useBackup ? "Backup code" : "Code"}
				</Label>
				<Input
					id="code"
					ref={codeRef}
					value={code}
					onChange={(event) => {
						const value = event.target.value
						edited(setCode)(value)
						if (
							!useBackup &&
							!pending &&
							/^\d{6}$/.test(value.replace(/\s/g, ""))
						) {
							void verifyCode(value)
						}
					}}
					autoComplete="one-time-code"
					inputMode={useBackup ? "text" : "numeric"}
					required={step === "code"}
				/>
			</div>
			<Label className="flex items-center gap-2 font-normal">
				<Checkbox
					checked={trustDevice}
					onCheckedChange={(value) => setTrustDevice(value === true)}
				/>
				Trust this device for 30 days
			</Label>
			<button
				type="button"
				className="justify-self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				onClick={() => {
					setUseBackup((previous) => !previous)
					setCode("")
					setProblem(null)
					codeRef.current?.focus()
				}}
			>
				{useBackup
					? "Use your authenticator app instead"
					: "Lost your phone? Use a backup code"}
			</button>
		</Reveal>
	)
}
