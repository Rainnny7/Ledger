import { type CSSProperties, useState } from "react"

/** One loop of the loader's animation; see the .app-loader styles in index.html. */
const PERIOD_MS = 3200

/**
 * The full-page loader: the Ledger mark building itself, column by column.
 * It's pinned to the middle of the window, so going from the boot screen to signing in to loading
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
		</div>
	)
}
