/** Classes added to a section for a moment after search jumps to it. */
const HIGHLIGHT_CLASSES = ["ring-2", "ring-primary/50"]

/** Scrolls a settings section into view and briefly rings it so the eye finds it. */
export function revealSection(sectionId: string) {
	const element = document.getElementById(`settings-section-${sectionId}`)
	if (!element) {
		return
	}
	element.scrollIntoView({ behavior: "smooth", block: "start" })
	element.classList.add(...HIGHLIGHT_CLASSES)
	window.setTimeout(() => {
		element.classList.remove(...HIGHLIGHT_CLASSES)
	}, 1600)
}
