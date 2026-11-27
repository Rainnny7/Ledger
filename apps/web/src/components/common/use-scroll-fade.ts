import { useEffect } from "react"

/**
 * Fades the top and bottom edges of a vertically scrolling element only while there is more
 * content to scroll to in that direction. It writes `--fade-top` / `--fade-bottom` onto the
 * element; pair it with the `scroll-fade-y` class (see index.css), which turns them into a mask.
 *
 * @param ref Scroll container to track.
 * @param fadeSize CSS length of each fade, e.g. `1.5rem`.
 */
export function useScrollFade(
	ref: React.RefObject<HTMLElement | null>,
	fadeSize = "1.5rem"
) {
	useEffect(() => {
		const element = ref.current
		if (!element) {
			return
		}
		const update = () => {
			const maxScroll = element.scrollHeight - element.clientHeight
			element.style.setProperty(
				"--fade-top",
				element.scrollTop > 1 ? fadeSize : "0px"
			)
			element.style.setProperty(
				"--fade-bottom",
				element.scrollTop < maxScroll - 1 ? fadeSize : "0px"
			)
		}
		update()
		element.addEventListener("scroll", update, { passive: true })
		const resizeObserver = new ResizeObserver(update)
		resizeObserver.observe(element)
		// Results come and go as the query changes, which changes scrollHeight without resizing the element.
		const mutationObserver = new MutationObserver(update)
		mutationObserver.observe(element, { childList: true, subtree: true })
		return () => {
			element.removeEventListener("scroll", update)
			resizeObserver.disconnect()
			mutationObserver.disconnect()
		}
	}, [ref, fadeSize])
}
