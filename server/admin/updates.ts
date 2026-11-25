import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { env } from "../config/env.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const SUCCESS_TTL = 6 * 60 * 60_000
const FAILURE_TTL = 60 * 60_000

/** UpdateInstall values accepted by validation and routes. */
export type UpdateInstall = "docker" | "source"

/** UpdateInfo values accepted by validation and routes. */
export type UpdateInfo = {
	current: string
	latest: string | null
	available: boolean
	url: string | null
	notes: string | null
	publishedAt: string | null
	install: UpdateInstall
	commands: string[]
}

type CacheEntry = { at: number; data: UpdateInfo }

let cache: CacheEntry | null = null

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

function installCommands(install: UpdateInstall): string[] {
	if (install === "docker") {
		return ["docker compose pull", "docker compose up -d"]
	}
	return [
		"git pull",
		"bun install",
		"bun run build",
		"# then restart: bun run start",
	]
}

function baseInfo(): Omit<
	UpdateInfo,
	"latest" | "available" | "url" | "notes" | "publishedAt"
> {
	const install: UpdateInstall =
		process.env.LEDGER_INSTALL === "docker" ? "docker" : "source"
	return {
		current: readCurrentVersion(),
		install,
		commands: installCommands(install),
	}
}

type GhRelease = {
	tag_name?: string
	html_url?: string
	body?: string | null
	published_at?: string | null
}

async function fetchLatest(): Promise<UpdateInfo> {
	const base = baseInfo()
	if (!env.updateCheck) {
		return {
			...base,
			latest: null,
			available: false,
			url: null,
			notes: null,
			publishedAt: null,
		}
	}
	const url = `https://api.github.com/repos/${env.updateRepo}/releases/latest`
	try {
		const response = await fetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "ledger-update-check",
			},
			signal: AbortSignal.timeout(15_000),
		})
		if (!response.ok) {
			throw new Error(String(response.status))
		}
		const data = (await response.json()) as GhRelease
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
		return {
			...base,
			latest: null,
			available: false,
			url: null,
			notes: null,
			publishedAt: null,
		}
	}
}

/** Cached GitHub release check; never throws. */
export async function getUpdateInfo(): Promise<UpdateInfo> {
	const now = Date.now()
	if (cache) {
		const ttl = cache.data.latest != null ? SUCCESS_TTL : FAILURE_TTL
		if (now - cache.at < ttl) {
			return cache.data
		}
	}
	const data = await fetchLatest()
	cache = { at: now, data }
	return data
}
