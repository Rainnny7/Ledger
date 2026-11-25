import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import { configureBoneyard } from "boneyard-js/react"
import "./bones/registry"
import App from "./App.tsx"
import {
  clearReloadFlag,
  reloadForNewVersion,
} from "@/components/error-boundary"

// A page's code file failed to load, usually because the app was rebuilt while this tab was open.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})
clearReloadFlag()

// index.html painted the theme's background inline until the stylesheet arrived; it has now.
document.documentElement.style.removeProperty("background-color")

// Skeleton bones use the theme's colours, with a soft sweep instead of a blink.
configureBoneyard({
  color: "var(--muted)",
  darkColor: "var(--muted)",
  animate: "shimmer",
  shimmerColor: "color-mix(in oklab, var(--muted), var(--foreground) 7%)",
  darkShimmerColor: "color-mix(in oklab, var(--muted), var(--foreground) 9%)",
  speed: "1.8s",
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
