import { type CSSProperties, useEffect, useState } from "react"

/** One loop of the loader's animation; see the .app-loader styles in index.html. */
const PERIOD_MS = 3200

/** Shown under the site name, one per loop of the animation. */
const LOADING_MESSAGES = [
	"Balancing the books…",
	"Counting your coins…",
	"Sharpening pencils…",
	"Reconciling accounts…",
	"Filing the paperwork…",
	"Polishing the ledger…",
	"Adding it all up…",
	"Checking the math twice…",
	"Stamping receipts…",
	"Tallying the totals…",
]

/** The messages in a random order, fixed for this visit so every loader copy agrees on the sequence. */
const MESSAGE_ORDER = [...LOADING_MESSAGES].sort(() => Math.random() - 0.5)

/**
 * The message for the current loop. It's derived from the same clock as the animation, so a loader
 * that remounts (boot to sign-in to a page load, with or without the nav) shows the same message
 * instead of flashing a different one.
 */
function currentMessage() {
	return MESSAGE_ORDER[
		Math.floor(performance.now() / PERIOD_MS) % MESSAGE_ORDER.length
	]
}

/** The site name and a random message that changes each loop. */
function LoaderText() {
	const [message, setMessage] = useState(currentMessage)
	useEffect(() => {
		let timer: number
		const schedule = () => {
			timer = window.setTimeout(() => {
				setMessage(currentMessage())
				schedule()
			}, PERIOD_MS - (performance.now() % PERIOD_MS))
		}
		schedule()
		return () => window.clearTimeout(timer)
	}, [])
	return (
		<div className="app-loader-text">
			<span className="app-loader-name">Ledger</span>
			<span key={message} className="app-loader-message">
				{message}
			</span>
		</div>
	)
}

/**
 * The full-page loader: the Ledger mark building itself, column by column.
 * It's pinned to the middle of the window, so going from the boot screen to logging in to loading
 * a page never moves it. The same markup is in index.html for before the app's code arrives, and
 * every copy runs on one clock, so a remount carries on mid-animation instead of starting over.
 *
 * `delayed` fades it in after a moment, for quick in-app page loads that shouldn't flash it.
 */
export function AppLoader({
	delayed,
	inPage,
}: {
	delayed?: boolean
	/** Shown under the app's header while a page loads, rather than as the whole screen. */
	inPage?: boolean
}) {
	const [phase] = useState(() => -(performance.now() % PERIOD_MS))
	return (
		<div
			className={[
				"app-loader",
				delayed && "app-loader-delayed",
				inPage && "app-loader-in-page",
			]
				.filter(Boolean)
				.join(" ")}
			role="status"
			aria-label="Loading"
			style={
				{ "--loader-phase": `${Math.round(phase)}ms` } as CSSProperties
			}
		>
			<div className="app-loader-mark">
				<svg viewBox="0 0 24 24" aria-hidden>
					<path
						className="app-loader-roof"
						d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"
					/>
					<path className="app-loader-col" d="M6 18v-7" />
					<path className="app-loader-col" d="M10 18v-7" />
					<path className="app-loader-col" d="M14 18v-7" />
					<path className="app-loader-col" d="M18 18v-7" />
					<path className="app-loader-base" d="M3 22h18" />
				</svg>
			</div>
			<LoaderText />
		</div>
	)
}
