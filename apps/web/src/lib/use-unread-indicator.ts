import { useEffect } from "react"
import { setUnreadTitleCount } from "@/lib/page-title"
import { useNotifications } from "@/lib/queries"

const FaviconBadge =
	'<circle cx="26" cy="6" r="5" fill="#ef4444" stroke="#fff" stroke-width="1.5"/>'

let faviconSvgTemplate: string | null = null
/** The tab's own icon href, captured once at module level so a remount can still restore it after the badge was applied. */
let originalIconHref: string | null = null
let faviconTemplatePromise: Promise<string | null> | null = null

/** Fetches the plain favicon once, only when a badge is first needed. */
function loadFaviconTemplate() {
	faviconTemplatePromise ??= fetch("/favicon.svg")
		.then((response) => (response.ok ? response.text() : null))
		.catch(() => null)
	return faviconTemplatePromise
}

/** Tab title prefix and favicon badge while unread notifications exist (authenticated shell only). */
export function useUnreadIndicator(enabled: boolean) {
	const { data } = useNotifications(enabled)
	const unread = data?.unreadCount ?? 0

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
		if (originalIconHref === null && !icon.href.startsWith("data:")) {
			originalIconHref = icon.href
		}
		let cancelled = false

		async function applyBadge() {
			if (!faviconSvgTemplate && unread > 0) {
				faviconSvgTemplate = await loadFaviconTemplate()
			}
			if (cancelled) {
				return
			}
			if (unread <= 0 && originalIconHref) {
				icon!.href = originalIconHref
				return
			}
			if (unread > 0 && faviconSvgTemplate) {
				const marked = faviconSvgTemplate.replace(
					"</svg>",
					`${FaviconBadge}</svg>`
				)
				icon!.href = `data:image/svg+xml,${encodeURIComponent(marked)}`
			}
		}

		void applyBadge()
		return () => {
			cancelled = true
		}
	}, [enabled, unread])
}
