import type { Variants } from "motion/react"
import { useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { getRouteApi } from "@tanstack/react-router"
import { useRetainedValue } from "@/components/common/use-retained-value"
import { useScrollFade } from "@/components/common/use-scroll-fade"
import {
	DEFAULT_SETTINGS_TAB,
	type SettingsTabId,
	searchSettingsTabs,
	visibleSettingsTabs,
} from "@/components/settings/settings-tabs"
import { revealSection } from "@/components/settings/settings-dialog-reveal"
import { demoMode } from "@/lib/demo"
import { useSession } from "@/lib/auth-client"
import { useAppConfig } from "@/lib/queries"

const appRoute = getRouteApi("/_authed/_app")

const TAB_PANEL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** Tab header and content slide in when reduced motion is off. */
const tabPanelSlideVariants: Variants = {
	initial: { opacity: 0, y: 6 },
	animate: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.18, ease: TAB_PANEL_EASE },
	},
}

/** Cross-fade only when the user prefers reduced motion. */
const tabPanelFadeVariants: Variants = {
	initial: { opacity: 0 },
	animate: { opacity: 1, transition: { duration: 0.12 } },
}

/**
 * Settings dialog open state, tab routing, search, and panel animation variants.
 */
export function useSettingsDialog() {
	const navigate = appRoute.useNavigate()
	const liveTabId = appRoute.useSearch({
		select: (search) => search.settings,
	})
	const [dismissed, setDismissed] = useState(false)
	const [previousLiveTabId, setPreviousLiveTabId] = useState(liveTabId)
	if (liveTabId !== previousLiveTabId) {
		setPreviousLiveTabId(liveTabId)
		if (liveTabId === undefined) {
			setDismissed(false)
		}
	}
	const open = liveTabId !== undefined && !dismissed
	const requestedTabId = useRetainedValue(liveTabId)
	const isAdmin = useSession().data?.user.role === "admin"
	const showMcp = Boolean(useAppConfig()?.mcp)
	const visibility = useMemo(() => ({ isAdmin, showMcp }), [isAdmin, showMcp])
	const tabs = useMemo(() => visibleSettingsTabs(visibility), [visibility])
	const activeTab =
		tabs.find((tab) => tab.id === requestedTabId) ??
		tabs.find((tab) => tab.id === DEFAULT_SETTINGS_TAB) ??
		tabs[0]
	const [query, setQuery] = useState("")
	const [highlightedHit, setHighlightedHit] = useState(0)
	const [mobilePanelChoice, setMobilePanelChoice] = useState<boolean>()
	const mobilePanelShown =
		mobilePanelChoice ?? requestedTabId !== DEFAULT_SETTINGS_TAB
	const searchInputRef = useRef<HTMLInputElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	useScrollFade(contentRef)
	const searchHits = useMemo(
		() => searchSettingsTabs(query, visibility),
		[query, visibility]
	)
	const searching = query.trim().length > 0
	const reduceMotion = useReducedMotion()
	const panelVariants = reduceMotion
		? tabPanelFadeVariants
		: tabPanelSlideVariants

	useEffect(() => {
		if (!open) {
			return
		}
		function handleKeyDown(event: KeyboardEvent) {
			const target = event.target as HTMLElement | null
			const typing =
				target?.closest("input, textarea, select, [contenteditable]") !=
				null
			if (event.key === "/" && !typing) {
				event.preventDefault()
				searchInputRef.current?.focus()
			}
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [open])

	useEffect(() => {
		if (!open || !activeTab) {
			return
		}
		contentRef.current?.scrollTo({ top: 0 })
	}, [activeTab, open])

	function closeDialog() {
		setDismissed(true)
	}

	function finishClosing() {
		setQuery("")
		setMobilePanelChoice(undefined)
		void navigate({
			replace: true,
			search: ({ settings: _closed, ...rest }) => rest,
		})
	}

	async function openTab(tabId: SettingsTabId, sectionId?: string) {
		setQuery("")
		setMobilePanelChoice(true)
		if (tabId !== activeTab?.id) {
			await navigate({
				replace: true,
				search: (previous) => ({ ...previous, settings: tabId }),
			})
		}
		requestAnimationFrame(() => {
			if (!sectionId) {
				contentRef.current?.scrollTo({ top: 0 })
				return
			}
			revealSection(sectionId)
		})
	}

	function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (!searching || searchHits.length === 0) {
			return
		}
		if (event.key === "ArrowDown") {
			event.preventDefault()
			setHighlightedHit((current) => (current + 1) % searchHits.length)
		} else if (event.key === "ArrowUp") {
			event.preventDefault()
			setHighlightedHit(
				(current) =>
					(current - 1 + searchHits.length) % searchHits.length
			)
		} else if (event.key === "Enter") {
			event.preventDefault()
			const hit = searchHits[highlightedHit]
			if (hit) {
				void openTab(hit.tabId, hit.sectionId)
			}
		}
	}

	function handleOpenChange(
		nextOpen: boolean,
		eventDetails: { reason: string; cancel: () => void }
	) {
		if (nextOpen) {
			return
		}
		if (eventDetails.reason === "escape-key" && searching) {
			eventDetails.cancel()
			setQuery("")
			return
		}
		closeDialog()
	}

	return {
		open,
		dismissed,
		demoMode,
		tabs,
		activeTab,
		query,
		setQuery,
		setHighlightedHit,
		highlightedHit,
		mobilePanelShown,
		setMobilePanelChoice,
		searchInputRef,
		contentRef,
		searchHits,
		searching,
		panelVariants,
		closeDialog,
		finishClosing,
		openTab,
		handleSearchKeyDown,
		handleOpenChange,
	}
}

export type SettingsDialogState = ReturnType<typeof useSettingsDialog>
