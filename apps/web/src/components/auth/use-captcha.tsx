import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"

/** How long to wait for Cloudflare to hand back a token before giving up. */
const CAPTCHA_TIMEOUT_MS = 20_000

/** Header the API reads the Turnstile token from (Better Auth's captcha plugin and the email lookup). */
export const CAPTCHA_HEADER = "x-captcha-response"

/** The captcha widget could not load or produce a token (blocked script, offline, timeout). */
export class CaptchaUnavailableError extends Error {
	constructor() {
		super("The security check could not run")
		this.name = "CaptchaUnavailableError"
	}
}

type PendingToken = {
	resolve: (token: string) => void
	reject: (error: Error) => void
}

/**
 * Invisible Cloudflare Turnstile that runs on demand. Render `widget` once in the page, then call
 * `getToken()` right before each protected request: tokens are single-use, so every call resets
 * the widget and waits for a fresh one. Without a site key (captcha switched off on the server)
 * there is no widget and `getToken()` resolves to `null`.
 *
 * @param siteKey The public Turnstile site key from `/api/config`, or null/undefined when off.
 */
export function useCaptcha(siteKey: string | null | undefined) {
	const instance = useRef<TurnstileInstance | null>(null)
	const pending = useRef<PendingToken | null>(null)
	// Resolves once the widget has rendered and can be executed.
	const [loaded] = useState(() => Promise.withResolvers<void>())

	const settle = useCallback((outcome: string | Error) => {
		const current = pending.current
		pending.current = null
		if (!current) {
			return
		}
		if (typeof outcome === "string") {
			current.resolve(outcome)
		} else {
			current.reject(outcome)
		}
	}, [])

	const getToken = useCallback(async (): Promise<string | null> => {
		if (!siteKey) {
			return null
		}
		return await new Promise<string>((resolve, reject) => {
			// A newer request replaces an older one still waiting.
			settle(new CaptchaUnavailableError())
			const timeout = setTimeout(() => {
				settle(new CaptchaUnavailableError())
			}, CAPTCHA_TIMEOUT_MS)
			pending.current = {
				resolve: (token) => {
					clearTimeout(timeout)
					resolve(token)
				},
				reject: (error) => {
					clearTimeout(timeout)
					reject(error)
				},
			}
			void loaded.promise.then(() => {
				if (pending.current === null) {
					return
				}
				instance.current?.reset()
				instance.current?.execute()
			})
		})
	}, [siteKey, settle, loaded])

	const widget = useMemo<ReactNode>(
		() =>
			siteKey ? (
				<Turnstile
					ref={instance}
					siteKey={siteKey}
					className="mx-auto"
					options={{
						execution: "execute",
						// Only shows itself if Cloudflare needs the visitor to prove something.
						appearance: "interaction-only",
						theme: "auto",
						retry: "never",
						refreshExpired: "never",
					}}
					scriptOptions={{
						onError: () => settle(new CaptchaUnavailableError()),
					}}
					onWidgetLoad={() => loaded.resolve()}
					onSuccess={(token) => settle(token)}
					onError={() => settle(new CaptchaUnavailableError())}
					onTimeout={() => settle(new CaptchaUnavailableError())}
				/>
			) : null,
		[siteKey, settle, loaded]
	)

	return { widget, getToken }
}

/** The fetch headers carrying a captcha token; undefined when captcha is off. */
export const captchaHeaders = (token: string | null) =>
	token ? { [CAPTCHA_HEADER]: token } : undefined
