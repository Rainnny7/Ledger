import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { boneyardPlugin } from "boneyard-js/vite"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig, loadEnv, type Plugin } from "vite"
import {
	accentClassName,
	ACCENT_IDS,
	DEFAULT_ACCENT,
	MODES,
} from "@ledger/shared/themes"

const ROOT_PKG = path.resolve(import.meta.dirname, "../../package.json")

/** App version at build time; prerelease suffix may come from the git branch when package.json is release-only. */
function appVersion(env: Record<string, string>) {
	if (env.BUILD_VERSION) {
		return env.BUILD_VERSION
	}
	const pkg = JSON.parse(readFileSync(ROOT_PKG, "utf8")) as {
		version?: string
	}
	let version = pkg.version ?? "0.0.0"
	if (!/^v?\d+\.\d+\.\d+-.+/i.test(version)) {
		try {
			const branch = execSync("git rev-parse --abbrev-ref HEAD", {
				cwd: import.meta.dirname,
				stdio: ["ignore", "pipe", "ignore"],
			})
				.toString()
				.trim()
			const match = branch.match(/-(dev|snapshot)(?:[.\w-]*)?$/i)
			if (match) {
				version = `${version}-${match[1]}`
			}
		} catch {
			// not a git checkout
		}
	}
	return version
}

/** The commit being built. CI or a Docker build without .git can pass it in as BUILD_GIT_HASH. */
function gitHash(env: Record<string, string>) {
	if (env.BUILD_GIT_HASH) {
		return env.BUILD_GIT_HASH.slice(0, 7)
	}
	try {
		return execSync("git rev-parse --short HEAD", {
			cwd: import.meta.dirname,
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim()
	} catch {
		return "unknown"
	}
}

/**
 * Applies the saved mode and accent before anything paints. next-themes does the same for the mode,
 * but only once the app's code has loaded, so until then the page (and the loader on it) would flash
 * the default white. The background is set inline too because the stylesheet isn't there yet in dev;
 * main.tsx drops it.
 */
/** JSON for an inline script. Escapes `<` so a value can never close the script early. */
const escapeForScript = (value: unknown) =>
	JSON.stringify(value).replace(/</g, "\\u003c")

/** Where the theme boot script is served. It's a file, not inline, because the production CSP forbids inline scripts. */
const THEME_BOOT_PATH = "/theme-boot.js"

function themeBootSource() {
	const modes = Object.fromEntries(
		MODES.map((mode) => [
			mode.id,
			[mode.className, mode.swatch[0], mode.dark],
		])
	)
	const accents = Object.fromEntries(
		ACCENT_IDS.map((id) => [id, accentClassName(id)])
	)
	return `(function(){try{var M=${escapeForScript(modes)},A=${escapeForScript(accents)},c=localStorage.getItem("theme")||"system",a=localStorage.getItem("accent");if(c==="system"||!M[c])c=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var m=M[c],r=document.documentElement;r.classList.add(m[0],A[A.hasOwnProperty(a)?a:${escapeForScript(DEFAULT_ACCENT)}]);r.style.colorScheme=m[2]?"dark":"light";r.style.backgroundColor=m[1]}catch(e){}})()`
}

const LOADER_THEME_VARS = [
	"--background",
	"--foreground",
	"--muted",
	"--muted-foreground",
	"--primary",
	"--primary-foreground",
] as const

const loaderThemeVarPattern = (name: string) =>
	new RegExp(`(?:^|[;\\s])${name.replace(/-/g, "\\-")}:\\s*([^;]+);`)

/**
 * Theme surface colours as a tiny stylesheet, copied from src/index.css. The loader in index.html
 * paints with these before the main stylesheet arrives, so its background no longer changes colour
 * when the app CSS loads.
 */
function loaderColorStyles() {
	const css = readFileSync(
		path.resolve(import.meta.dirname, "src/index.css"),
		"utf8"
	).replace(/\/\*[\s\S]*?\*\//g, "")
	const rules: string[] = []
	for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const decls: string[] = []
		for (const name of LOADER_THEME_VARS) {
			const match = body.match(loaderThemeVarPattern(name))
			if (match) {
				decls.push(`${name}:${match[1]}`)
			}
		}
		if (decls.length > 0) {
			rules.push(`${selector.trim()}{${decls.join(";")}}`)
		}
	}
	return `<style>${rules.join("")}</style>`
}

const themeBoot = (): Plugin => ({
	name: "theme-boot",
	transformIndexHtml(html) {
		return html.replace(
			"<!-- %THEME_BOOT% -->",
			`<script src="${THEME_BOOT_PATH}"></script>${loaderColorStyles()}`
		)
	},
	configureServer(server) {
		server.middlewares.use((request, response, next) => {
			if (request.url?.split("?")[0] !== THEME_BOOT_PATH) {
				return next()
			}
			response.setHeader("Content-Type", "text/javascript; charset=utf-8")
			response.end(themeBootSource())
		})
	},
	generateBundle() {
		this.emitFile({
			type: "asset",
			fileName: THEME_BOOT_PATH.slice(1),
			source: themeBootSource(),
		})
	},
})

// A personal finance app: nothing here belongs in a search index, share links included.
const ROBOTS_TXT = "User-agent: *\nDisallow: /\n"

const robotsTxt = (): Plugin => ({
	name: "robots-txt",
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			if (req.url?.split("?")[0] !== "/robots.txt") {
				return next()
			}
			res.setHeader("Content-Type", "text/plain; charset=utf-8")
			res.end(ROBOTS_TXT)
		})
	},
	generateBundle() {
		this.emitFile({
			type: "asset",
			fileName: "robots.txt",
			source: ROBOTS_TXT,
		})
	},
})

/** The monorepo root, where the shared `.env` lives. */
const repoRoot = path.resolve(import.meta.dirname, "../..")

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, repoRoot, "")
	// Extra hostnames the dev server answers on (a tunnel, a LAN name…), from ALLOWED_HOSTS in .env.
	const allowedHosts = (env.ALLOWED_HOSTS ?? "")
		.split(",")
		.map((h) => h.trim())
		.filter(Boolean)

	return {
		envDir: repoRoot,
		plugins: [
			tanstackRouter({ target: "react", autoCodeSplitting: true }),
			react(),
			tailwindcss(),
			robotsTxt(),
			themeBoot(),
			// Skeleton capture signs in with a session cookie (see boneyard.config.json), so it only runs
			// when BONEYARD_SESSION_TOKEN is set. It re-captures the pages below as you edit them.
			...(env.BONEYARD_SESSION_TOKEN
				? [
						boneyardPlugin({
							skipInitial: true,
							routes: [
								"/",
								"/transactions",
								"/insights",
								"/subscriptions",
								"/goals",
								"/advisor",
								"/work",
								"/invoices",
								"/taxes",
							],
						}),
					]
				: []),
			// `ANALYZE=1 bun run build` writes dist/bundle-stats.html.
			...(env.ANALYZE === "1"
				? [
						visualizer({
							filename: "dist/bundle-stats.html",
							gzipSize: true,
							brotliSize: true,
							open: false,
						}),
					]
				: []),
			...(env.VIZ_RAW === "1"
				? [
						visualizer({
							filename:
								env.VIZ_RAW_OUT ??
								"C:/Users/braydon/.claude/audit-ledger/stats.json",
							template: "raw-data",
							gzipSize: true,
							open: false,
						}),
					]
				: []),
		],
		build: {
			outDir: env.VIZ_OUT_DIR ?? "dist",
			rolldownOptions: {
				output: {
					// Each lucide icon and base-ui part would otherwise become its own tiny file, and the browser
					// only learns about them level by level, so a cold load is a long chain of round trips.
					codeSplitting: {
						groups: [
							{
								name: "vendor-react",
								priority: 3,
								test: /node_modules\/(react|react-dom|scheduler|@tanstack\/react-router|@tanstack\/router-core)\//,
							},
							{
								name: "vendor-icons",
								priority: 2,
								test: /node_modules\/lucide-react\//,
							},
							{
								name: "vendor-ui",
								priority: 2,
								test: /node_modules\/@base-ui\//,
							},
							{
								name: "vendor-ai",
								priority: 2,
								test: /node_modules\/(ai|@ai-sdk\/react|streamdown|use-stick-to-bottom|shiki|@shikijs)\//,
							},
						],
					},
				},
			},
		},
		resolve: {
			alias: { "@": path.resolve(import.meta.dirname, "./src") },
			dedupe: ["react", "react-dom"],
		},
		define: {
			"import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion(env)),
			"import.meta.env.VITE_BUILD_GIT_HASH": JSON.stringify(gitHash(env)),
			"import.meta.env.VITE_BUILD_TIME": JSON.stringify(
				new Date().toISOString()
			),
		},
		// Only scan the app's real entry for dependencies.
		optimizeDeps: { entries: ["index.html"] },
		server: {
			port: 5173,
			host: "0.0.0.0",
			allowedHosts,
			proxy: { "/api": "http://localhost:3001" },
			// The API writes the SQLite db and sessions here; never watch or reload on them.
			watch: {
				ignored: ["**/data/**", "**/apps/api/**", "**/src/bones/**"],
			},
		},
	}
})
