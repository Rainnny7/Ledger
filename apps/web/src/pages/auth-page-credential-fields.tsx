import { LockKeyhole } from "lucide-react"
import { PasswordInput } from "@/components/auth/password-input"
import { Reveal } from "@/components/auth/reveal"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PASSWORD_MAX, PasswordRules } from "@/components/common/password-rules"
import { cn } from "cn"
import type { useAuthPage } from "@/pages/use-auth-page"

type AuthState = ReturnType<typeof useAuthPage>

/** Email, password, and registration fields on the login card. */
export function AuthPageCredentialFields({ auth }: { auth: AuthState }) {
	const {
		step,
		email,
		setEmail,
		name,
		setName,
		password,
		setPassword,
		confirmPassword,
		setConfirmPassword,
		problem,
		emailRef,
		nameRef,
		passwordRef,
		locked,
		isRegister,
		passwordRegister,
		passwordsDiffer,
		changeEmail,
		edited,
	} = auth

	return (
		<Reveal
			open={step !== "code" && step !== "sent" && step !== "verify"}
			spaced={false}
			className="gap-0"
		>
			<div className="grid gap-2">
				<Label htmlFor="email">Email</Label>
				<div className="relative">
					<Input
						id="email"
						name="email"
						ref={emailRef}
						type="email"
						value={email}
						onChange={(event) =>
							edited(setEmail)(event.target.value)
						}
						autoComplete="username"
						autoCapitalize="none"
						spellCheck={false}
						readOnly={locked}
						required={step === "email"}
						aria-invalid={problem?.field === "email" || undefined}
						className={cn(locked && "bg-muted/50 pr-16")}
					/>
					{locked && (
						<button
							type="button"
							className="absolute inset-y-0 right-0 rounded-r-lg px-2.5 text-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							onClick={changeEmail}
						>
							Change
						</button>
					)}
				</div>
			</div>

			<Reveal open={isRegister}>
				<div className="grid gap-2">
					<Label htmlFor="name">Name</Label>
					<Input
						id="name"
						ref={nameRef}
						value={name}
						onChange={(event) =>
							edited(setName)(event.target.value)
						}
						autoComplete="name"
						required={isRegister}
					/>
				</div>
			</Reveal>

			<Reveal open={step === "password" || passwordRegister}>
				<div className="grid gap-2">
					<Label htmlFor="password">Password</Label>
					<PasswordInput
						id="password"
						name="password"
						ref={passwordRef}
						value={password}
						onChange={(event) =>
							edited(setPassword)(event.target.value)
						}
						autoComplete={
							isRegister ? "new-password" : "current-password"
						}
						maxLength={PASSWORD_MAX}
						aria-describedby={
							isRegister ? "password-rules" : undefined
						}
						aria-invalid={
							problem?.field === "password" || undefined
						}
						required={step === "password" || isRegister}
					/>
				</div>
			</Reveal>

			<Reveal open={passwordRegister} className="gap-3">
				<PasswordRules
					id="password-rules"
					password={password}
					className="sm:grid-cols-1"
				/>
				<div className="grid gap-2">
					<Label htmlFor="confirm-password">Confirm password</Label>
					<PasswordInput
						id="confirm-password"
						name="confirm-password"
						value={confirmPassword}
						onChange={(event) =>
							edited(setConfirmPassword)(event.target.value)
						}
						autoComplete="new-password"
						maxLength={PASSWORD_MAX}
						aria-invalid={passwordsDiffer || undefined}
						aria-describedby={
							passwordsDiffer
								? "confirm-password-hint"
								: undefined
						}
						required={isRegister}
					/>
					{passwordsDiffer && (
						<p
							id="confirm-password-hint"
							className="text-xs text-destructive"
						>
							Passwords don’t match yet.
						</p>
					)}
				</div>
			</Reveal>

			<Reveal open={step === "closed"}>
				<div className="flex gap-2.5 rounded-lg border bg-muted/50 p-3 text-sm">
					<LockKeyhole
						aria-hidden
						className="mt-0.5 size-4 shrink-0 text-muted-foreground"
					/>
					<p className="text-muted-foreground">
						There’s no account for this email, and new sign-ups are
						turned off. Ask the admin of this server to add you, or
						use a different email.
					</p>
				</div>
			</Reveal>
		</Reveal>
	)
}
