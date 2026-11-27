import { ArrowLeft, ChevronRight, Search, SearchX, X } from "lucide-react"
import type { Variants } from "motion/react"
import { m, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { getRouteApi } from "@tanstack/react-router"
import { useScrollFade } from "@/components/common/use-scroll-fade"
import {
	DEFAULT_SETTINGS_TAB,
	type SettingsSearchHit,
	type SettingsTabDefinition,
	type SettingsTabGroup,
	type SettingsTabId,
	searchSettingsTabs,
	visibleSettingsTabs,
} from "@/components/settings/settings-tabs"
import {
	type AnimatedIconComponent,
	useAnimatedIcon,
} from "@/components/icons/use-animated-icon"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { demoMode } from "@/lib/demo"
import { useSession } from "@/lib/auth-client"
import { useAppConfig } from "@/lib/queries"
import { cn } from "cn"

const appRoute = getRouteApi("/_authed/_app")

const GROUP_ORDER: SettingsTabGroup[] = ["Account", "Admin"]

/** Shared layout id for the sliding active tab highlight in the settings sidebar. */
const SETTINGS_NAV_ACTIVE_LAYOUT_ID = "settings-nav-active"

/** Classes added to a section for a moment after search jumps to it. */
const HIGHLIGHT_CLASSES = ["ring-2", "ring-primary/50"]

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
 * Account and server settings in one near-fullscreen dialog, opened with the
 * `?settings=<tabId>` search param so any link or palette entry can deep-link a tab.
 * Left: search plus grouped tab nav. Right: the active tab's cards.
 * Below `md` it goes fullscreen and the nav becomes a list that drills into a tab.
 */
export function SettingsDialog() {
	const navigate = appRoute.useNavigate()
	const requestedTabId = appRoute.useSearch({
		select: (search) => search.settings,
	})
	const open = requestedTabId !== undefined
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
	// Phones show either the tab list or one tab. Until the person picks, a deep link
	// to a specific tab opens that tab and a plain "open settings" opens the list.
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

	// "/" focuses the search, like most settings and docs search boxes.
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
		setQuery("")
		setMobilePanelChoice(undefined)
		void navigate({
			replace: true,
			search: ({ settings: _closed, ...rest }) => rest,
		})
	}

	/** Switches tab (and optionally jumps to one of its sections) once it has rendered. */
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

	const Panel = activeTab?.Panel

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen, eventDetails) => {
				if (nextOpen) {
					return
				}
				// Escape clears an active search before it closes the dialog.
				if (eventDetails.reason === "escape-key" && searching) {
					eventDetails.cancel()
					setQuery("")
					return
				}
				closeDialog()
			}}
		>
			<DialogContent
				showCloseButton={false}
				initialFocus={contentRef}
				className={cn(
					"top-0 left-0 flex h-svh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-background p-0 ring-0 sm:max-w-none",
					"md:top-1/2 md:left-1/2 md:h-[min(62rem,calc(100svh-3rem))] md:w-[calc(100vw-3rem)] md:max-w-[78rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-2xl md:ring-1"
				)}
			>
				<div className="flex min-h-0 flex-1">
					<aside
						className={cn(
							"flex w-full shrink-0 flex-col bg-muted/50 md:w-56 md:border-r",
							mobilePanelShown && "hidden md:flex"
						)}
					>
						<div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 md:px-5 md:pt-5">
							<p className="text-base font-semibold tracking-tight">
								Settings
							</p>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="md:hidden"
								aria-label="Close settings"
								onClick={closeDialog}
							>
								<X />
							</Button>
						</div>
						<div className="px-3 pb-3 md:px-4">
							<div className="relative">
								<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									ref={searchInputRef}
									value={query}
									onChange={(event) => {
										setQuery(event.target.value)
										setHighlightedHit(0)
									}}
									onKeyDown={handleSearchKeyDown}
									placeholder="Search settings"
									aria-label="Search settings"
									className="bg-background pr-8 pl-8"
								/>
								{searching ? null : (
									<Kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 md:inline-flex">
										/
									</Kbd>
								)}
							</div>
						</div>
						<nav
							aria-label="Settings"
							className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 md:px-4"
						>
							{searching ? (
								<SettingsSearchResults
									hits={searchHits}
									query={query}
									highlightedHit={highlightedHit}
									onHighlight={setHighlightedHit}
									onPick={(hit) =>
										void openTab(hit.tabId, hit.sectionId)
									}
								/>
							) : (
								GROUP_ORDER.map((group) => {
									const groupTabs = tabs.filter(
										(tab) => tab.group === group
									)
									if (groupTabs.length === 0) {
										return null
									}
									return (
										<div
											key={group}
											className="mt-2 first:mt-0"
										>
											<p className="px-2.5 pt-2 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground/80 uppercase">
												{group}
											</p>
											<ul className="grid gap-0.5">
												{groupTabs.map((tab) => (
													<SettingsNavItem
														key={tab.id}
														tab={tab}
														current={
															tab.id ===
															activeTab?.id
														}
														onSelect={() =>
															void openTab(tab.id)
														}
													/>
												))}
											</ul>
										</div>
									)
								})
							)}
						</nav>
					</aside>
					<section
						className={cn(
							"flex min-h-0 min-w-0 flex-1 flex-col",
							!mobilePanelShown && "hidden md:flex"
						)}
					>
						<header className="flex shrink-0 items-center gap-3 border-b px-4 py-3 md:px-8 md:py-3.5">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="-ml-1 md:hidden"
								aria-label="Back to all settings"
								onClick={() => setMobilePanelChoice(false)}
							>
								<ArrowLeft />
							</Button>
							{activeTab ? (
								<SettingsTabHeaderIcon
									key={activeTab.id}
									icon={activeTab.icon}
								/>
							) : null}
							<div className="grid min-w-0 flex-1 overflow-hidden">
								<m.div
									key={activeTab?.id ?? "settings"}
									className="grid"
									variants={panelVariants}
									initial="initial"
									animate="animate"
								>
									<DialogTitle className="text-lg font-semibold tracking-tight">
										{activeTab?.label ?? "Settings"}
									</DialogTitle>
									<DialogDescription className="text-sm text-muted-foreground">
										{activeTab?.description}
									</DialogDescription>
								</m.div>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Close settings"
								onClick={closeDialog}
							>
								<X />
							</Button>
						</header>
						<div
							ref={contentRef}
							tabIndex={-1}
							className="min-h-0 flex-1 scroll-fade-y overflow-y-auto outline-none"
						>
							<m.div
								key={activeTab?.id ?? "settings-panel"}
								variants={panelVariants}
								initial="initial"
								animate="animate"
								className="grid gap-8 px-4 py-6 md:px-8 md:py-8"
							>
								{demoMode ? (
									<Alert>
										<AlertDescription>
											Demo mode: preferences changed here
											only last until you exit demo mode.
											Everything else is turned off.
										</AlertDescription>
									</Alert>
								) : null}
								{Panel ? <Panel /> : null}
							</m.div>
						</div>
					</section>
				</div>
			</DialogContent>
		</Dialog>
	)
}

/** One settings sidebar tab with animated icon and sliding active highlight. */
function SettingsNavItem({
	tab,
	current,
	onSelect,
}: {
	tab: SettingsTabDefinition
	current: boolean
	onSelect: () => void
}) {
	const Icon = tab.icon
	const { ref: iconRef, handlers: iconHandlers } =
		useAnimatedIcon<HTMLButtonElement>()
	return (
		<li>
			<button
				type="button"
				aria-current={current ? "page" : undefined}
				onClick={onSelect}
				{...iconHandlers}
				className={cn(
					"group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm md:py-1.5",
					current
						? "z-0 font-medium text-primary hover:bg-primary/5"
						: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
				)}
			>
				{current ? (
					<m.span
						layoutId={SETTINGS_NAV_ACTIVE_LAYOUT_ID}
						className="absolute inset-0 -z-10 rounded-lg bg-primary/10"
						transition={{
							type: "spring",
							bounce: 0.15,
							duration: 0.45,
						}}
					/>
				) : null}
				<Icon
					ref={iconRef}
					size={16}
					className={cn(
						"flex size-4 shrink-0",
						current && "text-primary"
					)}
				/>
				<span className="flex-1 truncate">{tab.label}</span>
				<ChevronRight className="size-4 text-muted-foreground/60 md:hidden" />
			</button>
		</li>
	)
}

/** Active tab icon in the header; keyed by tab, so it plays once each time the tab changes. */
function SettingsTabHeaderIcon({
	icon: Icon,
}: {
	icon: AnimatedIconComponent
}) {
	const reduceMotion = useReducedMotion()
	const { ref: iconRef, handlers: iconHandlers } =
		useAnimatedIcon<HTMLDivElement>()

	// Wait a frame so the icon's motion controls are bound before starting it.
	useEffect(() => {
		if (reduceMotion) {
			return
		}
		const frame = requestAnimationFrame(() => {
			void iconRef.current?.startAnimation()
		})
		return () => cancelAnimationFrame(frame)
	}, [reduceMotion, iconRef])

	return (
		<div
			{...iconHandlers}
			className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary"
		>
			<Icon ref={iconRef} size={18} className="flex shrink-0" />
		</div>
	)
}

/** Search matches in place of the sidebar nav, with keyboard highlight. */
function SettingsSearchResults({
	hits,
	highlightedHit,
	query,
	onHighlight,
	onPick,
}: {
	hits: SettingsSearchHit[]
	query: string
	highlightedHit: number
	onHighlight: (index: number) => void
	onPick: (hit: SettingsSearchHit) => void
}) {
	if (hits.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 px-2 py-10 text-center text-sm text-muted-foreground">
				<SearchX className="size-5 text-muted-foreground/70" />
				No settings match.
			</div>
		)
	}
	return (
		<div className="grid gap-0.5" role="listbox" aria-label="Results">
			{hits.map((hit, index) => {
				const highlighted = index === highlightedHit
				return (
					<button
						key={`${hit.tabId}:${hit.sectionId}`}
						type="button"
						role="option"
						aria-selected={highlighted}
						tabIndex={-1}
						onMouseMove={() => onHighlight(index)}
						onClick={() => onPick(hit)}
						className={cn(
							"flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left",
							highlighted
								? "bg-background shadow-xs ring-1 ring-foreground/5"
								: "hover:bg-foreground/5"
						)}
					>
						<span className="text-sm font-medium text-foreground">
							<HighlightedText
								text={hit.sectionTitle}
								query={query}
							/>
						</span>
						<span className="text-xs text-muted-foreground">
							{hit.tabGroup} ·{" "}
							<HighlightedText
								text={hit.tabLabel}
								query={query}
							/>
						</span>
					</button>
				)
			})}
		</div>
	)
}

/** Scrolls a settings section into view and briefly rings it so the eye finds it. */
function revealSection(sectionId: string) {
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

/** Renders `text` with every occurrence of the query's words marked, so it's clear why a result matched. */
function HighlightedText({ text, query }: { text: string; query: string }) {
	const words = query
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
	if (words.length === 0) {
		return text
	}
	const pattern = new RegExp(`(${words.join("|")})`, "gi")
	return text.split(pattern).map((part, index) =>
		index % 2 === 1 ? (
			<mark
				key={index}
				className="rounded-[3px] bg-primary/20 px-px text-primary"
			>
				{part}
			</mark>
		) : (
			part
		)
	)
}
