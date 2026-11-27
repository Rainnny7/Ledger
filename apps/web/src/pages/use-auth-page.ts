import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useCaptcha } from "@/components/auth/use-captcha"
import {
	requestAuthMagicLink,
	submitAuthPage,
	verifyAuthCode,
	type AuthFlowContext,
} from "@/pages/auth-page-auth-flow"
import { usePageTitle } from "@/lib/page-title"
import { useAppConfig } from "@/lib/queries"
import {
	AUTH_SUBMIT_LABEL,
	authPageStepCopy,
	authSubmitDisabled,
	problemFromLinkError,
	type AuthFormProblem,
	type AuthStep,
} from "@/pages/auth-page-helpers"

/**
 * Login and sign-up page state, handlers, and derived step copy.
 */
export function useAuthPage() {
	const navigate = useNavigate()
	const config = useAppConfig()
	const { widget, getToken } = useCaptcha(config?.turnstileSiteKey)
	// A login link for an account with 2FA lands here with the code step already pending.
	const initialSearch = new URLSearchParams(window.location.search)
	const [step, setStep] = useState<AuthStep>(() =>
		initialSearch.get("twoFactor") ? "code" : "email"
	)
	const [email, setEmail] = useState("")
	const [name, setName] = useState("")
	const [password, setPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [problem, setProblem] = useState<AuthFormProblem | null>(() => {
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
	const copy = authPageStepCopy(step, {
		useBackup,
		emailFirstSignUp,
		email,
	})
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

	function flowCtx(): AuthFlowContext {
		return {
			navigate,
			getToken,
			step,
			email,
			name,
			password,
			code,
			useBackup,
			trustDevice,
			isRegister,
			emailFirstSignUp,
			setStep,
			setEmail,
			setPassword,
			setConfirmPassword,
			setCode,
			setMagicLinkEnabled,
			setProblem,
			setPending,
			nameRef,
			changeEmail,
		}
	}

	async function requestMagicLink() {
		if (pending) {
			return
		}
		await requestAuthMagicLink(flowCtx())
	}

	/** Edits clear the last error, so it never lingers beside a field that has changed. */
	function edited<Value>(setter: (value: Value) => void) {
		return (value: Value) => {
			setter(value)
			setProblem(null)
		}
	}

	async function verifyCode(value: string) {
		await verifyAuthCode(flowCtx(), value)
	}

	async function onSubmit(event: React.FormEvent) {
		event.preventDefault()
		if (pending) {
			return
		}
		await submitAuthPage(flowCtx(), requestMagicLink)
	}

	const registerSubmitLabel =
		isRegister && emailFirstSignUp
			? "Email sign-in link"
			: AUTH_SUBMIT_LABEL.register

	const submitDisabled = authSubmitDisabled({
		pending,
		step,
		email,
		password,
		name,
		confirmPassword,
		code,
		configReady: config !== null,
		isRegister,
		emailFirstSignUp,
		passwordRegister,
	})

	return {
		widget,
		copy,
		step,
		setStep,
		email,
		setEmail,
		name,
		setName,
		password,
		setPassword,
		confirmPassword,
		setConfirmPassword,
		problem,
		setProblem,
		pending,
		code,
		setCode,
		useBackup,
		setUseBackup,
		trustDevice,
		setTrustDevice,
		magicLinkEnabled,
		emailRef,
		nameRef,
		passwordRef,
		codeRef,
		locked,
		isRegister,
		passwordRegister,
		passwordsDiffer,
		changeEmail,
		requestMagicLink,
		edited,
		verifyCode,
		onSubmit,
		registerSubmitLabel,
		submitDisabled,
	}
}
