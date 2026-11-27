import { createFileRoute } from "@tanstack/react-router"
import {
	parseSettingsTab,
	type SettingsTabId,
} from "@/components/settings/settings-tabs"
import { AppShellLayout } from "@/lib/router/app-shell-layout"

/** Main app shell (nav, demo banner, outlet). */
export const Route = createFileRoute("/_authed/_app")({
	// `?settings=<tab>` opens the settings dialog over any page; other keys pass through to child routes.
	validateSearch: (
		search: Record<string, unknown>
	): Record<string, unknown> & { settings?: SettingsTabId } => {
		const { settings, ...rest } = search
		const tabId = parseSettingsTab(settings)
		return tabId ? { ...rest, settings: tabId } : rest
	},
	component: AppShellLayout,
})
