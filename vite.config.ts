import { execSync } from "node:child_process"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { boneyardPlugin } from "boneyard-js/vite"
import { visualizer } from "rollup-plugin-visualizer"
import { defineConfig, loadEnv, type Plugin } from "vite"
import { THEMES } from "./shared/themes.ts"

/** The commit being built. CI or a Docker build without .git can pass it in as BUILD_GIT_HASH. */
function gitHash(env: Record<string, string>) {
  if (env.BUILD_GIT_HASH) return env.BUILD_GIT_HASH.slice(0, 7)
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
 * Applies the saved theme before anything paints. next-themes does the same, but only once the app's
 * code has loaded, so until then the page (and the loader on it) would flash the default white. The
 * background is set inline too because the stylesheet isn't there yet in dev; main.tsx drops it.
 */
const themeBoot = (): Plugin => ({
  name: "theme-boot",
  transformIndexHtml(html) {
    const themes = Object.fromEntries(
      THEMES.map((t) => [t.id, [t.className, t.swatch[0], t.dark]])
    )
    const script = `<script>(function(){try{var T=${JSON.stringify(themes)},c=localStorage.getItem("theme")||"system";if(c==="system"||!T[c])c=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";var t=T[c],r=document.documentElement;r.classList.add(t[0]);r.style.colorScheme=t[2]?"dark":"light";r.style.backgroundColor=t[1]}catch(e){}})()</script>`
    return html.replace("<!-- %THEME_BOOT% -->", script)
  },
})

// A personal finance app: nothing here belongs in a search index, share links included.
const ROBOTS_TXT = "User-agent: *\nDisallow: /\n"

const robotsTxt = (): Plugin => ({
  name: "robots-txt",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split("?")[0] !== "/robots.txt") return next()
      res.setHeader("Content-Type", "text/plain; charset=utf-8")
      res.end(ROBOTS_TXT)
    })
  },
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "robots.txt", source: ROBOTS_TXT })
  },
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  // Extra hostnames the dev server answers on (a tunnel, a LAN name…), from ALLOWED_HOSTS in .env.
  const allowedHosts = (env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)

  return {
    plugins: [
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
    ],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "./src") },
      dedupe: ["react", "react-dom"],
    },
    define: {
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
      watch: { ignored: ["**/data/**", "**/server/**", "**/src/bones/**"] },
    },
  }
})
