/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Semver at build time (may include a prerelease suffix from the branch). */
	readonly VITE_APP_VERSION: string
	/** Short git commit the app was built from, or "unknown". */
	readonly VITE_BUILD_GIT_HASH: string
	/** ISO time the app was built (or the dev server started). */
	readonly VITE_BUILD_TIME: string
}
