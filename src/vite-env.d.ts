/// <reference types="vite/client" />

interface ImportMetaEnv {
	/** Short git commit the app was built from, or "unknown". */
	readonly VITE_BUILD_GIT_HASH: string
	/** ISO time the app was built (or the dev server started). */
	readonly VITE_BUILD_TIME: string
}
