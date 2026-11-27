import { toastWelcome } from "@/lib/toast"
import { friendlyAuthProblem } from "@/components/auth/auth-problem"
import { captchaHeaders } from "@/components/auth/use-captcha"
import { signIn, signUp, twoFactor } from "@/lib/auth-client"
import { lookupEmail } from "@/lib/auth-lookup"
import { detectCurrency } from "@/lib/currency"
import {
	problemFromThrown,
	type AuthFormProblem,
	type AuthStep,
} from "@/pages/auth-page-helpers"
import type { useNavigate } from "@tanstack/react-router"

type NavigateFn = ReturnType<typeof useNavigate>

export type AuthFlowContext = {
	navigate: NavigateFn
	getToken: () => Promise<string | null>
	step: AuthStep
	email: string
	name: string
	password: string
	code: string
	useBackup: boolean
	trustDevice: boolean
	isRegister: boolean
	emailFirstSignUp: boolean
	setStep: (step: AuthStep) => void
	setEmail: (value: string) => void
	setPassword: (value: string) => void
	setConfirmPassword: (value: string) => void
	setCode: (value: string) => void
	setMagicLinkEnabled: (value: boolean) => void
	setProblem: (value: AuthFormProblem | null) => void
	setPending: (value: boolean) => void
	nameRef: React.RefObject<HTMLInputElement | null>
	changeEmail: () => void
}

/** Sends a magic-link email for login or email-first sign-up. */
export async function requestAuthMagicLink(ctx: AuthFlowContext) {
	const trimmedEmail = ctx.email.trim()
	if (ctx.isRegister && !ctx.name.trim()) {
		ctx.setProblem({
			title: "Name required",
			message: "Enter your name to sign up with an email link.",
			field: undefined,
		})
		ctx.nameRef.current?.focus()
		return
	}
	ctx.setPending(true)
	ctx.setProblem(null)
	try {
		const fetchOptions = {
			headers: captchaHeaders(await ctx.getToken()),
		}
		const { error } = await signIn.magicLink({
			email: trimmedEmail,
			name: ctx.isRegister ? ctx.name.trim() : undefined,
			callbackURL: "/",
			newUserCallbackURL: "/",
			errorCallbackURL: "/login",
			fetchOptions,
		})
		if (error) {
			ctx.setProblem(friendlyAuthProblem(error))
		} else {
			ctx.setStep("sent")
		}
	} catch (error) {
		ctx.setProblem(problemFromThrown(error))
	} finally {
		ctx.setPending(false)
	}
}

/** Verifies a TOTP or backup 2FA code. */
export async function verifyAuthCode(ctx: AuthFlowContext, value: string) {
	ctx.setPending(true)
	ctx.setProblem(null)
	try {
		const { data: verified, error } = ctx.useBackup
			? await twoFactor.verifyBackupCode({
					code: value.trim(),
					trustDevice: ctx.trustDevice,
				})
			: await twoFactor.verifyTotp({
					code: value.replace(/\s/g, ""),
					trustDevice: ctx.trustDevice,
				})
		if (!error) {
			ctx.navigate({ to: "/", replace: true })
			toastWelcome(verified?.user?.name)
			return
		}
		if (error.code === "INVALID_TWO_FACTOR_COOKIE") {
			ctx.setProblem(friendlyAuthProblem(error))
			ctx.setStep("email")
			ctx.setCode("")
			ctx.setMagicLinkEnabled(false)
			return
		}
		ctx.setProblem(
			error.status === 429
				? friendlyAuthProblem(error)
				: {
						title: "That code didn’t work",
						message: ctx.useBackup
							? "Check the backup code and try again. Each one works only once."
							: "Check the code and try again. It changes every 30 seconds.",
					}
		)
	} catch (error) {
		ctx.setProblem(problemFromThrown(error))
	} finally {
		ctx.setPending(false)
	}
}

/** Main login card submit: email lookup, password sign-in, or sign-up. */
export async function submitAuthPage(
	ctx: AuthFlowContext,
	requestMagicLink: () => Promise<void>
) {
	if (ctx.step === "code") {
		await verifyAuthCode(ctx, ctx.code)
		return
	}
	if (ctx.step === "closed" || ctx.step === "sent") {
		ctx.changeEmail()
		return
	}
	if (ctx.step === "verify") {
		ctx.setPassword("")
		ctx.setConfirmPassword("")
		ctx.setStep("password")
		return
	}
	ctx.setPending(true)
	ctx.setProblem(null)
	try {
		const trimmedEmail = ctx.email.trim()
		if (ctx.step === "email") {
			const found = await lookupEmail(trimmedEmail, await ctx.getToken())
			ctx.setEmail(trimmedEmail)
			ctx.setMagicLinkEnabled(found.magicLink)
			ctx.setStep(
				found.exists
					? "password"
					: found.registrationOpen
						? "register"
						: "closed"
			)
			if (
				!found.exists &&
				found.registrationOpen &&
				ctx.emailFirstSignUp
			) {
				ctx.setMagicLinkEnabled(true)
			}
			return
		}
		if (ctx.isRegister && ctx.emailFirstSignUp) {
			await requestMagicLink()
			return
		}
		const fetchOptions = {
			headers: captchaHeaders(await ctx.getToken()),
		}
		const { data, error } = ctx.isRegister
			? await signUp.email({
					name: ctx.name.trim(),
					email: trimmedEmail,
					password: ctx.password,
					currency: detectCurrency(),
					fetchOptions,
				})
			: await signIn.email({
					email: trimmedEmail,
					password: ctx.password,
					fetchOptions,
				})
		if (error) {
			ctx.setProblem({
				...friendlyAuthProblem(error),
				field:
					error.code === "INVALID_EMAIL_OR_PASSWORD" ||
					error.code === "WEAK_PASSWORD"
						? "password"
						: undefined,
			})
		} else if (ctx.isRegister && data && data.token === null) {
			ctx.setPassword("")
			ctx.setConfirmPassword("")
			ctx.setStep("verify")
		} else if (
			data &&
			"twoFactorRedirect" in data &&
			data.twoFactorRedirect
		) {
			ctx.setCode("")
			ctx.setStep("code")
		} else {
			ctx.navigate({ to: "/", replace: true })
			toastWelcome(data?.user?.name)
		}
	} catch (error) {
		ctx.setProblem(problemFromThrown(error))
	} finally {
		ctx.setPending(false)
	}
}
