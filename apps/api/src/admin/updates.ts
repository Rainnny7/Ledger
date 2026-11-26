import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { env } from "../config/env.ts"

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../.."
)
const SUCCESS_TTL = 6 * 60 * 60_000
const FAILURE_TTL = 60 * 60_000

/** UpdateInstall values accepted by validation and routes. */
export type UpdateInstall = "docker" | "source"

/** Where updates come from: `stable` follows master (`latest` image), `dev` the newest `ver/*` branch. */
export type ReleaseChannel = "stable" | "dev"

/** Container image repository published by CI. */
export const IMAGE_REPOSITORY = "ghcr.io/rainnny7/ledger"

const GITHUB_API = "https://api.github.com/repos/rainnny7/ledger"
const DEV_BRANCH_PATTERN = /^ver\/\d+(\.\d+)*(-[\w.]+)?$/

/** UpdateInfo values accepted by validation and routes. */
export type UpdateInfo = {
	current: string
	latest: string | null
	available: boolean
	url: string | null
	notes: string | null
	publishedAt: string | null
	/** False when the server has UPDATE_CHECK=false, so nothing is polled. */
	checkEnabled: boolean
	install: UpdateInstall
	channel: ReleaseChannel
	/** Docker image tag for the selected channel, or null when the dev branch is unknown. */
	imageTag: string | null
	/** Whether this server can swap its own container (set by the route, not the GitHub check). */
	canSwitch: boolean
	commands: string[]
}

type CacheEntry = { at: number; data: UpdateInfo }

const cache = new Map<ReleaseChannel, CacheEntry>()

/** Forgets cached checks, e.g. after the admin picks another channel. */
export function clearUpdateCache() {
	cache.clear()
}

function readCurrentVersion(): string {
	const pkg = JSON.parse(
		readFileSync(path.join(ROOT, "package.json"), "utf8")
	) as { version?: string }
	return pkg.version ?? "0.0.0"
}

function parseSemver(v: string) {
	return v
		.replace(/^v/i, "")
		.split(/[.+_-]/)
		.map((part) => {
			const parsedNumber = Number(part)
			return Number.isFinite(parsedNumber) ? parsedNumber : 0
		})
}

/** Strip a leading `v` and compare dot-separated numeric parts. */
export function semverNewer(latest: string, current: string): boolean {
	const latestParts = parseSemver(latest)
	const currentParts = parseSemver(current)
	const len = Math.max(latestParts.length, currentParts.length)
	for (let i = 0; i < len; i++) {
		const latestPart = latestParts[i] ?? 0
		const currentPart = currentParts[i] ?? 0
		if (latestPart > currentPart) {
			return true
		}
		if (latestPart < currentPart) {
			return false
		}
	}
	return false
}

/** Image tag CI publishes for a branch: `/` becomes `-` (`ver/1.0.1-dev` -> `ver-1.0.1-dev`). */
export function branchImageTag(branch: string): string {
	return branch.replace(/\//g, "-")
}

/** Highest-version `ver/X.Y.Z...` branch name, or null when none match. */
export function pickNewestDevBranch(branchNames: string[]): string | null {
	let newest: string | null = null
	for (const name of branchNames) {
		if (
			DEV_BRANCH_PATTERN.test(name) &&
			(newest === null ||
				semverNewer(name.slice("ver/".length), newest.slice("ver/".length)))
		) {
			newest = name
		}
	}
	return newest
}

/** Copy-paste upgrade commands; docker commands name the channel's image tag. */
export function installCommands(
	install: UpdateInstall,
	imageTag: string | null
): string[] {
	if (install === "docker") {
		return [
			imageTag
				? `# in docker-compose.yml set: image: ${IMAGE_REPOSITORY}:${imageTag}`
				: "# in docker-compose.yml set the image tag to the newest ver-* tag",
			"docker compose pull",
			"docker compose up -d",
		]
	}
	return [
		"git pull",
		"bun install",
		"bun run build",
		"# then restart: bun run start",
	]
}

function baseInfo(
	channel: ReleaseChannel,
	imageTag: string | null
): Omit<
	UpdateInfo,
	"latest" | "available" | "url" | "notes" | "publishedAt"
> {
	const install: UpdateInstall = env.LEDGER_INSTALL
	return {
		current: readCurrentVersion(),
		checkEnabled: env.UPDATE_CHECK,
		install,
		channel,
		imageTag,
		canSwitch: false,
		commands: installCommands(install, imageTag),
	}
}

async function githubJson<T>(endpoint: string): Promise<T> {
	const response = await fetch(`${GITHUB_API}/${endpoint}`, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "ledger-update-check",
		},
		signal: AbortSignal.timeout(15_000),
	})
	if (!response.ok) {
		throw new Error(String(response.status))
	}
	return (await response.json()) as T
}

type GhRelease = {
	tag_name?: string
	html_url?: string
	body?: string | null
	published_at?: string | null
}

const EMPTY_CHECK = {
	latest: null,
	available: false,
	url: null,
	notes: null,
	publishedAt: null,
}

async function fetchStable(): Promise<UpdateInfo> {
	const base = baseInfo("stable", "latest")
	if (!env.UPDATE_CHECK) {
		return { ...base, ...EMPTY_CHECK }
	}
	try {
		const data = await githubJson<GhRelease>("releases/latest")
		const tag = data.tag_name?.trim()
		if (!tag) {
			throw new Error("no tag")
		}
		const latest = tag.replace(/^v/i, "")
		return {
			...base,
			latest,
			available: semverNewer(latest, base.current),
			url: data.html_url ?? null,
			notes: data.body?.trim() || null,
			publishedAt: data.published_at ?? null,
		}
	} catch {
		return { ...base, ...EMPTY_CHECK }
	}
}

async function fetchDev(): Promise<UpdateInfo> {
	if (!env.UPDATE_CHECK) {
		return { ...baseInfo("dev", null), ...EMPTY_CHECK }
	}
	try {
		const branches = await githubJson<{ name?: string }[]>(
			"branches?per_page=100"
		)
		const branch = pickNewestDevBranch(
			branches.flatMap((entry) => (entry.name ? [entry.name] : []))
		)
		if (!branch) {
			throw new Error("no dev branch")
		}
		const base = baseInfo("dev", branchImageTag(branch))
		const latest = branch.slice("ver/".length)
		return {
			...base,
			latest,
			available: semverNewer(latest, base.current),
			url: `https://github.com/rainnny7/ledger/tree/${branch}`,
			notes: null,
			publishedAt: null,
		}
	} catch {
		return { ...baseInfo("dev", null), ...EMPTY_CHECK }
	}
}

/** Cached GitHub check for the channel (release or newest ver/* branch); never throws. */
export async function getUpdateInfo(
	channel: ReleaseChannel
): Promise<UpdateInfo> {
	const now = Date.now()
	const cached = cache.get(channel)
	if (cached) {
		const ttl = cached.data.latest != null ? SUCCESS_TTL : FAILURE_TTL
		if (now - cached.at < ttl) {
			return cached.data
		}
	}
	const data = channel === "dev" ? await fetchDev() : await fetchStable()
	cache.set(channel, { at: now, data })
	return data
}
