import { useEffect } from "react"

/** `APP_NAME` export. */
export const APP_NAME = "Ledger"

/** Current page segment (e.g. "Bank Accounts") before the app name; used when unread count updates the tab. */
let currentPageTitle: string | null = null

let unreadCount = 0

/** Builds the browser tab title, including an unread prefix when needed. */
export function buildDocumentTitle(pageTitle: string | null | undefined) {
	const base = pageTitle ? `${pageTitle} | ${APP_NAME}` : APP_NAME
	if (unreadCount <= 0) {
		return base
	}
	const label = unreadCount > 99 ? "99+" : String(unreadCount)
	return `(${label}) ${base}`
}

/** Updates the unread prefix on the tab title and reapplies the current page title. */
export function setUnreadTitleCount(count: number) {
	unreadCount = Math.max(0, count)
	document.title = buildDocumentTitle(currentPageTitle)
}

/** "Bank Accounts | Ledger"; just "Ledger" while the page's name isn't known yet. */
export function usePageTitle(title: string | null | undefined) {
	useEffect(() => {
		currentPageTitle = title ?? null
		document.title = buildDocumentTitle(currentPageTitle)
	}, [title])
}
