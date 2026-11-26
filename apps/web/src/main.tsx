import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
// oxlint-disable-next-line import/no-unassigned-import -- global stylesheet side effect
import "./index.css"
import App from "./App.tsx"
import { clearReloadFlag, reloadForNewVersion } from "@/lib/chunk-reload"

// A page's code file failed to load, usually because the app was rebuilt while this tab was open.
window.addEventListener("vite:preloadError", (event) => {
	if (reloadForNewVersion()) {
		event.preventDefault()
	}
})
clearReloadFlag()

// index.html painted the theme's background inline until the stylesheet arrived; it has now.
document.documentElement.style.removeProperty("background-color")

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>
)

// Skeleton bones use the theme's colours; load after first paint so login stays lean.
void Promise.all([
	import("boneyard-js/react"),
	import("./bones/registry.ts"),
]).then(([{ configureBoneyard }]) => {
	configureBoneyard({
		color: "var(--muted)",
		darkColor: "var(--muted)",
		animate: "shimmer",
		shimmerColor: "color-mix(in oklab, var(--muted), var(--foreground) 7%)",
		darkShimmerColor:
			"color-mix(in oklab, var(--muted), var(--foreground) 9%)",
		speed: "1.8s",
	})
})
