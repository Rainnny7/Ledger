import { useLayoutEffect, useRef, type ReactNode } from "react"

const storageKey = (id: string) => `ledger:slot-height:${id}`

function readHeight(id: string) {
	try {
		return Number(localStorage.getItem(storageKey(id))) || 0
	} catch {
		return 0
	}
}

function writeHeight(id: string, height: number) {
	try {
		localStorage.setItem(storageKey(id), String(height))
	} catch {
		// Private mode: the slot just won't pre-reserve next time.
	}
}

/**
 * A page section that arrives after its data loads, without shifting what's below it.
 *
 * While `ready` is false it holds the height the section had last time (remembered per `id`), so
 * the content below is already where it will end up; once ready the content fades in place.
 * Pass `null` as children when there is nothing to show: the slot collapses and forgets its height.
 */
export function ReservedSlot({
	id,
	ready,
	children,
}: {
	id: string
	ready: boolean
	children: ReactNode | null
}) {
	const contentRef = useRef<HTMLDivElement>(null)
	const hasContent = children != null

	useLayoutEffect(() => {
		if (!ready) {
			return
		}
		const element = contentRef.current
		if (!element) {
			writeHeight(id, 0)
			return
		}
		const remember = () => writeHeight(id, element.offsetHeight)
		remember()
		const observer = new ResizeObserver(remember)
		observer.observe(element)
		return () => observer.disconnect()
	}, [id, ready, hasContent])

	if (!ready) {
		const reserved = readHeight(id)
		return reserved > 0 ? (
			<div aria-hidden style={{ height: reserved }} />
		) : null
	}
	if (!hasContent) {
		return null
	}
	return (
		<div
			ref={contentRef}
			className="animate-[ledger-fade_350ms_ease-out_both] motion-reduce:animate-none"
		>
			{children}
		</div>
	)
}
