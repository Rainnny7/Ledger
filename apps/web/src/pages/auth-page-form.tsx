import { Loader2 } from "lucide-react"
import { AuthError } from "@/components/auth/auth-error"
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
import { AUTH_SUBMIT_LABEL } from "@/pages/auth-page-helpers"
import { AuthPageCredentialFields } from "@/pages/auth-page-credential-fields"
import { AuthPageTwoFactorPanel } from "@/pages/auth-page-two-factor-panel"
import type { useAuthPage } from "@/pages/use-auth-page"

type AuthState = ReturnType<typeof useAuthPage>

/** Login card layout and fields. */
export function AuthPageForm({ auth }: { auth: AuthState }) {
	const {
		widget,
		copy,
		step,
		setStep,
		setPassword,
		setProblem,
		name,
		pending,
		isRegister,
		passwordRegister,
		magicLinkEnabled,
		requestMagicLink,
		onSubmit,
		registerSubmitLabel,
		submitDisabled,
	} = auth

	return (
		<div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-muted/40 p-4">
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
						<AuthError problem={auth.problem} />
						<AuthPageCredentialFields auth={auth} />
						<AuthPageTwoFactorPanel auth={auth} />
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
								: AUTH_SUBMIT_LABEL[step]}
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
