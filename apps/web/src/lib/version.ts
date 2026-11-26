/** True when `version` has a semver prerelease suffix (e.g. `1.0.1-dev`, `2.0.0-snapshot.1`). */
export function isPrereleaseVersion(version: string): boolean {
	const core = version.replace(/^v/i, "").trim()
	const dash = core.indexOf("-")
	return dash !== -1 && core.slice(dash + 1).length > 0
}