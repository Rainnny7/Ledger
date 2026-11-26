/**
 * Keeps the browser-tab icon in step with the logo: the same bank mark on a tile built from the
 * active accent colour. A static favicon file can't read the page's CSS variables, so the icon is
 * redrawn as an SVG data URL whenever the accent or mode class on <html> changes.
 */

/** The bank icon's paths, shared with the in-app logo (lucide "landmark"). */
const LANDMARK_PATHS =
	'<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>'

/** Resolves the theme's current primary and primary-foreground colours to concrete values. */
function readBrandColors() {
	const probe = document.createElement("span")
	probe.style.backgroundColor = "var(--primary)"
	probe.style.color = "var(--primary-foreground)"
	probe.style.display = "none"
	document.body.appendChild(probe)
	const styles = getComputedStyle(probe)
	const colors = { tile: styles.backgroundColor, icon: styles.color }
	probe.remove()
	return colors
}

/** Builds the icon as an SVG data URL, matching the `bg-sunset` tile in index.css. */
function buildFaviconUrl() {
	const { tile, icon } = readBrandColors()
	const svg =
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
		'<defs><linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">' +
		`<stop offset="0" stop-color="color-mix(in oklab, ${tile} 88%, white)"/>` +
		`<stop offset="1" stop-color="${tile}"/>` +
		"</linearGradient></defs>" +
		'<rect width="32" height="32" rx="8" fill="url(#tile)"/>' +
		`<g transform="translate(4 4)" fill="none" stroke="${icon}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${LANDMARK_PATHS}</g>` +
		"</svg>"
	return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Redraws the favicon now and again each time the theme classes on <html> change. */
export function syncFaviconWithTheme() {
	const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
	if (!link) {
		return
	}
	const update = () => {
		link.href = buildFaviconUrl()
	}
	update()
	new MutationObserver(update).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	})
}
