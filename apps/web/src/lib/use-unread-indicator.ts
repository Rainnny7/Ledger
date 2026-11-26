import { useEffect, useRef } from "react"
import { setUnreadTitleCount } from "@/lib/page-title"
import { useNotifications } from "@/lib/queries"

const FaviconBadge =
	'<circle cx="26" cy="6" r="5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>'

/** Tab title prefix and favicon badge while unread notifications exist (authenticated shell only). */
export function useUnreadIndicator(enabled: boolean) {
	const { data } = useNotifications(enabled)
	const unread = data?.unreadCount ?? 0
	const svgTemplate = useRef<string | null>(null)
	const originalIconHref = useRef<string | null>(null)

	useEffect(() => {
		setUnreadTitleCount(enabled ? unread : 0)
		return () => setUnreadTitleCount(0)
	}, [enabled, unread])

	useEffect(() => {
		if (!enabled) {
			return
		}
		const icon =
			document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
			document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]')
		if (!icon) {
			return
		}
		let cancelled = false

		async function apply() {
			if (!svgTemplate.current) {
				const response = await fetch("/favicon.svg")
				if (!response.ok) {
					return
				}
				svgTemplate.current = await response.text()
				originalIconHref.current = icon!.href
			}
			if (cancelled) {
				return
			}
			if (unread <= 0 && originalIconHref.current) {
				icon!.href = originalIconHref.current
				return
			}
			if (unread > 0 && svgTemplate.current) {
				const marked = svgTemplate.current.replace(
					"</svg>",
					`${FaviconBadge}</svg>`
				)
				icon!.href = `data:image/svg+xml,${encodeURIComponent(marked)}`
			}
		}

		void apply()
		return () => {
			cancelled = true
		}
	}, [enabled, unread])
}