import { Loader2, LockKeyhole } from "lucide-react"
import { toastWelcome } from "@/lib/toast"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
	AuthError,
	friendlyAuthProblem,
	type AuthProblem,
} from "@/components/auth/auth-error"
import { PasswordInput } from "@/components/auth/password-input"
import { Reveal } from "@/components/auth/reveal"
import {
	CaptchaUnavailableError,
	captchaHeaders,
	useCaptcha,
} from "@/components/auth/use-captcha"
import { Brand } from "@/components/layout/brand"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
	isStrongPassword,
	PASSWORD_MAX,
	PasswordRules,
} from "@/components/common/password-rules"
import { signIn, signUp, twoFactor } from "@/lib/auth-client"
import { LookupError, lookupEmail } from "@/lib/auth-lookup"
import { detectCurrency } from "@/lib/currency"
import { usePageTitle } from "@/lib/page-title"
import { useAppConfig } from "@/lib/queries"
import { cn } from "cn"

/**
 * Where the visitor is: typing their email, entering their password, creating an account, told
 * that sign-ups are closed, or entering a two-factor code.
 */
type Step =
	| "email"
	| "password"
	| "register"
	| "closed"
	| "code"
	| "sent"
	| "verify"

/** What to say at the top of the card for each step. */
const STEP_COPY: Record<Step, { title: string; description: string }> = {
	email: {
		title: "Log In or Sign Up",
		description: "Enter your email to continue.",
	},
	password: {
		title: "Welcome Back",
		description:
			"Enter your password to see your balances and transactions.",
	},
	register: {
		title: "Create Your Account",
		description: "Choose a password to start tracking your bank accounts.",
	},
	closed: {
		title: "Sign-Ups Are Closed",
		description: "This server isn’t taking new accounts right now.",
	},
	code: {
		title: "Two-Factor Authentication",
		description: "Enter the 6-digit code from your authenticator app.",
	},
	sent: {
		title: "Check Your Email",
		description: "",
	},
	verify: {
		title: "Verify Your Email",
		description: "",
	},
}

/** What a failed login or verification link (the `?error=` on this page) means, in plain words. */
function problemFromLinkError(errorCode: string): AuthProblem {
	switch (errorCode) {
		case "banned":
			return {
				title: "Access Turned Off",
				message:
					"Your access to this Ledger has been turned off. Ask its admin to restore it.",
			}
		case "REGISTRATION_CLOSED":
		case "new_user_signup_disabled":
			return {
				title: "Sign-Ups Are Closed",
				message:
					"This server isn’t accepting new accounts right now. Ask its admin to add you.",
			}
		case "user_not_found":
		case "USER_NOT_FOUND":
			return {
				title: "No Account Found",
				message:
					"We couldn’t find an account for that link. Enter your email to log in or sign up.",
			}
		default:
			return {
				title: "Link Expired or Invalid",
				message:
					"That link may have expired or already been used. Request a new one or log in with your password.",
			}
	}
}

const SUBMIT_LABEL: Record<Step, string> = {
	email: "Continue",
	password: "Log in",
	register: "Create Account",
	closed: "Use a different email",
	code: "Verify",
	sent: "Use a different email",
	verify: "Back to log in",
}

/** A problem to show, and the field it belongs to (flagged invalid for assistive tech). */
type FormProblem = AuthProblem & { field?: "email" | "password" | "confirm" }

/** Turns anything thrown while checking the captcha, looking up the email or calling the API into a message. */
function problemFromThrown(error: unknown): FormProblem {
	if (error instanceof CaptchaUnavailableError) {
		return {
			title: "Security Check Unavailable",
			message:
				"We couldn’t run the security check. Check your connection or any content blockers, then try again.",
		}
	}
	if (error instanceof LookupError) {
		return {
			...friendlyAuthProblem(error, "Couldn’t check that email"),
			field: error.status === 400 ? "email" : undefined,
		}
	}
	return {
		title: "Can’t Reach the Server",
		message: "Check your connection and try again.",
	}
}

/**
 * The one page for logging in and signing up. It starts with just an email; the server says whether
 * that address has an account, and the rest of the form (password, or name and a new password)
 * slides in to match. Accounts with two-factor finish with a code step.
 */
export function AuthPage() {
	const navigate = useNavigate()
	const config = useAppConfig()
	const { widget, getToken } = useCaptcha(config?.turnstileSiteKey)
	// A login link for an account with 2FA lands here with the code step already pending.
	const initialSearch = new URLSearchParams(window.location.search)
	const [step, setStep] = useState<Step>(() =>
		initialSearch.get("twoFactor") ? "code" : "email"
	)
	const [email, setEmail] = useState("")
	const [name, setName] = useState("")
	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [problem, setProblem] = useState<FormProblem | null>(() => {
		const errorCode = initialSearch.get("error")
		return errorCode ? problemFromLinkError(errorCode) : null
	})
	const [pending, setPending] = useState(false)
	const [code, setCode] = useState("")
	const [useBackup, setUseBackup] = useState(false)
	const [trustDevice, setTrustDevice] = useState(false)
	const [magicLinkEnabled, setMagicLinkEnabled] = useState(false)
	const emailRef = useRef<HTMLInputElement>(null)
	const nameRef = useRef<HTMLInputElement>(null)
	const passwordRef = useRef<HTMLInputElement>(null)
	const codeRef = useRef<HTMLInputElement>(null)

	const emailFirstSignUp = config?.emailLinks === true
	const copy =
		step === "code" && useBackup
			? {
					...STEP_COPY.code,
					description:
						"Enter one of the backup codes you saved when you turned on 2FA.",
				}
			: step === "register" && emailFirstSignUp
				? {
						...STEP_COPY.register,
						description:
							"Enter your name and we’ll email you a sign-in link to create your account.",
					}
				: step === "verify"
					? {
							...STEP_COPY.verify,
							description: `We sent a verification link to ${email.trim()}. Open it, then log in.`,
						}
					: step === "sent"
						? {
								...STEP_COPY.sent,
								description: `We sent a login link to ${email.trim()}. It expires in 10 minutes.`,
							}
						: STEP_COPY[step]
	usePageTitle(copy.title)

	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		if (params.has("error") || params.has("twoFactor")) {
			params.delete("error")
			params.delete("twoFactor")
			const query = params.toString()
			const next = `${window.location.pathname}${query ? `?${query}` : ""}`
			window.history.replaceState(null, "", next)
		}
	}, [])

	// Move to the first field that just appeared.
	useEffect(() => {
		const target = {
			email: emailRef,
			password: passwordRef,
			register: nameRef,
			closed: null,
			code: codeRef,
			sent: null,
			verify: null,
		}[step]
		target?.current?.focus()
	}, [step])

	const locked = step !== "email"
	const isRegister = step === "register"
	const passwordRegister = isRegister && !emailFirstSignUp
	const passwordsDiffer =
		confirmPassword.length > 0 && confirmPassword !== password

	/** Back to the first step, forgetting anything typed for the old address. */
	function changeEmail() {
		setStep("email")
		setPassword("")
		setConfirmPassword("")
		setMagicLinkEnabled(false)
		setProblem(null)
	}

	async function requestMagicLink() {
		if (pending) {
			return
		}
		const trimmedEmail = email.trim()
		if (isRegister && !name.trim()) {
			setProblem({
				title: "Name required",
				message: "Enter your name to sign up with an email link.",
				field: undefined,
			})
			nameRef.current?.focus()
			return
		}
		setPending(true)
		setProblem(null)
		try {
			const fetchOptions = {
				headers: captchaHeaders(await getToken()),
			}
			const { error } = await signIn.magicLink({
				email: trimmedEmail,
				name: isRegister ? name.trim() : undefined,
				callbackURL: "/",
				newUserCallbackURL: "/",
				errorCallbackURL: "/login",
				fetchOptions,
			})
			if (error) {
				setProblem(friendlyAuthProblem(error))
			} else {
				setStep("sent")
			}
		} catch (error) {
			setProblem(problemFromThrown(error))
		} finally {
			setPending(false)
		}
	}

	/** Edits clear the last error, so it never lingers beside a field that has changed. */
	function edited<Value>(setter: (value: Value) => void) {
		return (value: Value) => {
			setter(value)
			setProblem(null)
		}
	}

	async function verifyCode(value: string) {
		setPending(true)
		setProblem(null)
		try {
			const { data: verified, error } = useBackup
				? await twoFactor.verifyBackupCode({
						code: value.trim(),
						trustDevice,
					})
				: await twoFactor.verifyTotp({
						code: value.replace(/\s/g, ""),
						trustDevice,
					})
			if (!error) {
				navigate({ to: "/", replace: true })
				toastWelcome(verified?.user?.name)
				return
			}
			if (error.code === "INVALID_TWO_FACTOR_COOKIE") {
				setProblem(friendlyAuthProblem(error))
				setStep("email")
				setCode("")
				setMagicLinkEnabled(false)
				return
			}
			setProblem(
				error.status === 429
					? friendlyAuthProblem(error)
					: {
							title: "That code didn’t work",
							message: useBackup
								? "Check the backup code and try again. Each one works only once."
								: "Check the code and try again. It changes every 30 seconds.",
						}
			)
		} catch (error) {
			setProblem(problemFromThrown(error))
		} finally {
			setPending(false)
		}
	}

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault()
		if (pending) {
			return
		}
		if (step === "code") {
			await verifyCode(code)
			return
		}
		if (step === "closed" || step === "sent") {
			changeEmail()
			return
		}
		if (step === "verify") {
			setPassword("")
			setConfirmPassword("")
			setStep("password")
			return
		}
		setPending(true)
		setProblem(null)
		try {
			const trimmedEmail = email.trim()
			if (step === "email") {
				const found = await lookupEmail(trimmedEmail, await getToken())
				setEmail(trimmedEmail)
				setMagicLinkEnabled(found.magicLink)
				setStep(
					found.exists
						? "password"
						: found.registrationOpen
							? "register"
							: "closed"
				)
				if (
					!found.exists &&
					found.registrationOpen &&
					emailFirstSignUp
				) {
					setMagicLinkEnabled(true)
				}
				return
			}
			if (isRegister && emailFirstSignUp) {
				await requestMagicLink()
				return
			}
			const fetchOptions = {
				headers: captchaHeaders(await getToken()),
			}
			const { data, error } = isRegister
				? await signUp.email({
						name: name.trim(),
						email: trimmedEmail,
						password,
						currency: detectCurrency(),
						fetchOptions,
					})
				: await signIn.email({
						email: trimmedEmail,
						password,
						fetchOptions,
					})
			if (error) {
				setProblem({
					...friendlyAuthProblem(error),
					field:
						error.code === "INVALID_EMAIL_OR_PASSWORD" ||
						error.code === "WEAK_PASSWORD"
							? "password"
							: undefined,
				})
			} else if (isRegister && data && data.token === null) {
				// The server holds the account until the address is confirmed, so there is no session yet.
				setPassword("")
				setConfirmPassword("")
				setStep("verify")
			} else if (
				data &&
				"twoFactorRedirect" in data &&
				data.twoFactorRedirect
			) {
				setCode("")
				setStep("code")
			} else {
				navigate({ to: "/", replace: true })
				toastWelcome(data?.user?.name)
			}
		} catch (error) {
			setProblem(problemFromThrown(error))
		} finally {
			setPending(false)
		}
	}

	const registerSubmitLabel =
		isRegister && emailFirstSignUp
			? "Email sign-in link"
			: SUBMIT_LABEL.register

	const submitDisabled =
		pending ||
		(step === "email" && (!email.trim() || config === null)) ||
		(step === "password" && !password) ||
		(passwordRegister &&
			(!name.trim() ||
				!isStrongPassword(password) ||
				password !== confirmPassword)) ||
		(isRegister && emailFirstSignUp && !name.trim()) ||
		(step === "code" && !code.trim())

	return (
		<div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-muted/40 p-4">
			{/* Soft sunset glow behind the card */}
			<div
				aria-hidden
				className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-sunset opacity-10 blur-3xl dark:opacity-[0.08]"
			/>
			<Brand className="relative text-lg" />
			<Card className="relative w-full max-w-sm">
				<CardHeader>
					<CardTitle>{copy.title}</CardTitle>
					<CardDescription>{copy.description}</CardDescription>
				</CardHeader>
				<form onSubmit={onSubmit}>
					<CardContent className="grid">
						<AuthError problem={problem} />

						<Reveal
							open={
								step !== "code" &&
								step !== "sent" &&
								step !== "verify"
							}
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
										// The email is the username for password managers.
										autoComplete="username"
										autoCapitalize="none"
										spellCheck={false}
										readOnly={locked}
										required={step === "email"}
										aria-invalid={
											problem?.field === "email" ||
											undefined
										}
										className={cn(
											locked && "bg-muted/50 pr-16"
										)}
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

							<Reveal
								open={step === "password" || passwordRegister}
							>
								<div className="grid gap-2">
									<Label htmlFor="password">Password</Label>
									<PasswordInput
										id="password"
										name="password"
										ref={passwordRef}
										value={password}
										onChange={(event) =>
											edited(setPassword)(
												event.target.value
											)
										}
										autoComplete={
											isRegister
												? "new-password"
												: "current-password"
										}
										maxLength={PASSWORD_MAX}
										aria-describedby={
											isRegister
												? "password-rules"
												: undefined
										}
										aria-invalid={
											problem?.field === "password" ||
											undefined
										}
										required={
											step === "password" || isRegister
										}
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
									<Label htmlFor="confirm-password">
										Confirm password
									</Label>
									<PasswordInput
										id="confirm-password"
										name="confirm-password"
										value={confirmPassword}
										onChange={(event) =>
											edited(setConfirmPassword)(
												event.target.value
											)
										}
										autoComplete="new-password"
										maxLength={PASSWORD_MAX}
										aria-invalid={
											passwordsDiffer || undefined
										}
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
										There’s no account for this email, and
										new sign-ups are turned off. Ask the
										admin of this server to add you, or use
										a different email.
									</p>
								</div>
							</Reveal>
						</Reveal>

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
										// A full authenticator code needs no extra click.
										if (
											!useBackup &&
											!pending &&
											/^\d{6}$/.test(
												value.replace(/\s/g, "")
											)
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
									onCheckedChange={(value) =>
										setTrustDevice(value === true)
									}
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
					</CardContent>
					<CardFooter className="mt-6 flex-col gap-3">
						<Button
							type="submit"
							className="w-full"
							variant={
								step === "closed" ||
								step === "sent" ||
								step === "verify"
									? "outline"
									: "default"
							}
							disabled={submitDisabled}
						>
							{pending && <Loader2 className="animate-spin" />}
							{step === "register"
								? registerSubmitLabel
								: SUBMIT_LABEL[step]}
						</Button>
						{(step === "password" || passwordRegister) &&
						magicLinkEnabled ? (
							<Button
								type="button"
								variant="outline"
								className="w-full"
								disabled={
									pending || (isRegister && !name.trim())
								}
								onClick={() => void requestMagicLink()}
							>
								{pending && (
									<Loader2 className="animate-spin" />
								)}
								{isRegister
									? "Sign up with an email link instead"
									: "Email me a login link"}
							</Button>
						) : null}
						{step === "code" && (
							<button
								type="button"
								className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
								onClick={() => {
									setStep("password")
									setPassword("")
									setProblem(null)
								}}
							>
								Back to log in
							</button>
						)}
						{widget}
					</CardFooter>
				</form>
			</Card>
		</div>
	)
}
