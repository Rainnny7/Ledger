/**
 * Minimal env for the Chromium child process (no APP_SECRET or other app secrets).
 * Set TD_BROWSER_NO_SANDBOX=1 in Docker when Chromium cannot use the sandbox
 * (common on slim images without user namespaces); prefer fixing the image over leaving this on.
 */
export function chromiumLaunchEnv(): Record<string, string> {
	const keys = [
		"PATH",
		"HOME",
		"USERPROFILE",
		"TMPDIR",
		"TMP",
		"TEMP",
		"LANG",
		"LC_ALL",
		"LC_CTYPE",
		"DISPLAY",
		"WAYLAND_DISPLAY",
		"XDG_RUNTIME_DIR",
		"PLAYWRIGHT_BROWSERS_PATH",
		"SystemRoot",
		"COMSPEC",
		"PATHEXT",
	]
	const env: Record<string, string> = {}
	for (const key of keys) {
		const value = process.env[key]
		if (value !== undefined && value !== "") {
			env[key] = value
		}
	}
	return env
}

/** Whether TD browser sessions should run Chromium sandboxed. */
export function chromiumUseSandbox(): boolean {
	const value = process.env.TD_BROWSER_NO_SANDBOX
	return value !== "1" && value !== "true" && value?.toLowerCase() !== "yes"
}
