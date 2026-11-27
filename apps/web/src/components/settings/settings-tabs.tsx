import type { PaletteItem } from "@/components/layout/command-palette-data"
import { ActivityIcon } from "@/components/icons/activity"
import { ArchiveIcon } from "@/components/icons/archive"
import { MailIcon } from "@/components/icons/mail"
import { PaletteIcon } from "@/components/icons/palette"
import { SettingsIcon } from "@/components/icons/settings"
import { ShieldCheckIcon } from "@/components/icons/shield-check"
import { SlidersHorizontalIcon } from "@/components/icons/sliders-horizontal"
import { TerminalIcon } from "@/components/icons/terminal"
import type { AnimatedIconComponent } from "@/components/icons/use-animated-icon"
import { UserIcon } from "@/components/icons/user"
import { UsersIcon } from "@/components/icons/users"
import { demoMode } from "@/lib/demo"
import type { ComponentType } from "react"
import {
	SettingsAccountPanel,
	SettingsAppearancePanel,
	SettingsDeveloperPanel,
	SettingsNotificationsPanel,
	SettingsPreferencesPanel,
	SettingsSecurityPanel,
	SettingsServerActivityPanel,
	SettingsServerEmailPanel,
	SettingsServerGeneralPanel,
	SettingsServerTasksPanel,
	SettingsServerUsersPanel,
} from "@/components/settings/settings-tab-panels"

/** Identifier for a settings dialog tab. */
export type SettingsTabId =
	| "appearance"
	| "preferences"
	| "notifications"
	| "security"
	| "developer"
	| "account"
	| "server-general"
	| "server-users"
	| "server-email"
	| "server-tasks"
	| "server-activity"

/** Sidebar group for settings tabs. */
export type SettingsTabGroup = "Account" | "Admin"

/** Searchable section within a tab. */
export interface SettingsTabSection {
	id: string
	title: string
	/** Space-delimited extra words for sidebar search. */
	keywords: string
}

/** Tab metadata and panel component. */
export interface SettingsTabDefinition {
	id: SettingsTabId
	label: string
	description: string
	group: SettingsTabGroup
	icon: AnimatedIconComponent
	sections: SettingsTabSection[]
	Panel: ComponentType
	/** Shown only when this returns true (defaults to visible). */
	visible?: (context: SettingsTabVisibilityContext) => boolean
}

/** Inputs that decide which tabs appear. */
export interface SettingsTabVisibilityContext {
	isAdmin: boolean
	showMcp: boolean
}

const ALL_TABS: SettingsTabDefinition[] = [
	{
		id: "appearance",
		label: "Appearance",
		description: "Theme, accent colour, and how Ledger looks.",
		group: "Account",
		icon: PaletteIcon,
		sections: [
			{
				id: "appearance",
				title: "Appearance",
				keywords: "theme mode accent colour color dark light",
			},
		],
		Panel: SettingsAppearancePanel,
	},
	{
		id: "preferences",
		label: "Preferences",
		description: "Currency, locale, and AI suggestions.",
		group: "Account",
		icon: SlidersHorizontalIcon,
		sections: [
			{
				id: "preferences",
				title: "Preferences",
				keywords: "currency home money locale",
			},
			{
				id: "ai-suggestions",
				title: "AI suggestions",
				keywords: "ask ledger chat hide ai sparkle suggestions",
			},
		],
		Panel: SettingsPreferencesPanel,
	},
	{
		id: "notifications",
		label: "Notifications",
		description:
			"Choose how admin messages, security notices, and digests reach you.",
		group: "Account",
		icon: MailIcon,
		sections: [
			{
				id: "notification-sources",
				title: "Notification delivery",
				keywords:
					"email alerts bell admin security digest messages in-app",
			},
		],
		Panel: SettingsNotificationsPanel,
		visible: () => !demoMode,
	},
	{
		id: "security",
		label: "Security",
		description: "Password, two-factor authentication, and devices.",
		group: "Account",
		icon: ShieldCheckIcon,
		sections: [
			{
				id: "password",
				title: "Password",
				keywords: "change reset credentials",
			},
			{
				id: "two-factor",
				title: "Two-Factor Authentication",
				keywords: "2fa totp backup codes",
			},
			{
				id: "devices",
				title: "Devices",
				keywords: "sessions browsers logged in",
			},
		],
		Panel: SettingsSecurityPanel,
	},
	{
		id: "developer",
		label: "Developer",
		description: "API keys and MCP access for integrations.",
		group: "Account",
		icon: TerminalIcon,
		sections: [
			{
				id: "api-keys",
				title: "API Keys",
				keywords: "token automation",
			},
			{
				id: "mcp",
				title: "MCP Access",
				keywords: "model context protocol",
			},
		],
		Panel: SettingsDeveloperPanel,
		visible: () => !demoMode,
	},
	{
		id: "account",
		label: "Account",
		description: "Permanently delete your Ledger account.",
		group: "Account",
		icon: UserIcon,
		sections: [
			{
				id: "delete-account",
				title: "Delete Account",
				keywords: "remove close profile",
			},
		],
		Panel: SettingsAccountPanel,
	},
	{
		id: "server-general",
		label: "General",
		description: "Release channel, feature flags, and demo data.",
		group: "Admin",
		icon: SettingsIcon,
		sections: [
			{
				id: "feature-flags",
				title: "Feature Flags",
				keywords: "experiments toggles",
			},
			{
				id: "release-channel",
				title: "Release Channel",
				keywords: "stable beta updates",
			},
			{
				id: "demo-data",
				title: "Demo Data",
				keywords: "sample seed",
			},
		],
		Panel: SettingsServerGeneralPanel,
		visible: ({ isAdmin }) => isAdmin && !demoMode,
	},
	{
		id: "server-users",
		label: "Users",
		description: "People who can use this Ledger, and who may sign up.",
		group: "Admin",
		icon: UsersIcon,
		sections: [
			{
				id: "users",
				title: "Users",
				keywords: "accounts roles invite ban",
			},
		],
		Panel: SettingsServerUsersPanel,
		visible: ({ isAdmin }) => isAdmin && !demoMode,
	},
	{
		id: "server-email",
		label: "Email",
		description: "Outgoing mail and admin notifications.",
		group: "Admin",
		icon: MailIcon,
		sections: [
			{
				id: "smtp",
				title: "SMTP",
				keywords: "mail server relay",
			},
			{
				id: "notifications",
				title: "Send Notification",
				keywords: "broadcast announcement email",
			},
		],
		Panel: SettingsServerEmailPanel,
		visible: ({ isAdmin }) => isAdmin && !demoMode,
	},
	{
		id: "server-tasks",
		label: "Tasks & Backups",
		description: "Scheduled jobs and database backups.",
		group: "Admin",
		icon: ArchiveIcon,
		sections: [
			{
				id: "tasks",
				title: "Tasks",
				keywords: "cron schedule jobs",
			},
			{
				id: "backups",
				title: "Backups",
				keywords: "snapshot restore owner",
			},
		],
		Panel: SettingsServerTasksPanel,
		visible: ({ isAdmin }) => isAdmin && !demoMode,
	},
	{
		id: "server-activity",
		label: "Activity",
		description: "Audit log of admin actions on this server.",
		group: "Admin",
		icon: ActivityIcon,
		sections: [
			{
				id: "activity",
				title: "Activity",
				keywords: "audit log history",
			},
		],
		Panel: SettingsServerActivityPanel,
		visible: ({ isAdmin }) => isAdmin && !demoMode,
	},
]

/** Default tab when opening settings without a specific tab. */
export const DEFAULT_SETTINGS_TAB: SettingsTabId = "appearance"

/** Every defined tab id (including hidden ones). */
export const SETTINGS_TAB_IDS = ALL_TABS.map((tab) => tab.id)

/**
 * Normalizes a raw `settings` search value to a known tab id, or undefined when absent/invalid.
 */
export function parseSettingsTab(value: unknown): SettingsTabId | undefined {
	if (typeof value !== "string" || value === "") {
		return undefined
	}
	if (!SETTINGS_TAB_IDS.includes(value as SettingsTabId)) {
		return undefined
	}
	return value as SettingsTabId
}

/** Tabs the current user is allowed to see. */
export function visibleSettingsTabs(context: SettingsTabVisibilityContext) {
	return ALL_TABS.filter((tab) => (tab.visible ?? (() => true))(context))
}

/** Deep-link path with the settings search param. */
export function settingsHref(tabId: SettingsTabId) {
	return `/?settings=${tabId}`
}

/** Command palette entries: one row per visible tab. */
export function settingsPaletteItems(
	context: SettingsTabVisibilityContext
): PaletteItem[] {
	return visibleSettingsTabs(context).map((tab) => ({
		id: `settings:${tab.id}`,
		label: tab.label,
		hint: `${tab.group} settings`,
		icon: tab.icon,
		group: "Pages" as const,
		to: settingsHref(tab.id),
		keywords: [
			tab.description,
			...tab.sections.map(
				(section) => `${section.title} ${section.keywords}`
			),
		].join(" "),
	}))
}

/** Flat search hits across tab labels, section titles, and keywords. */
export interface SettingsSearchHit {
	tabId: SettingsTabId
	tabLabel: string
	tabGroup: SettingsTabGroup
	sectionId: string
	sectionTitle: string
}

/** Match sidebar search query against tabs and sections. */
export function searchSettingsTabs(
	query: string,
	context: SettingsTabVisibilityContext
): SettingsSearchHit[] {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
	if (!words.length) {
		return []
	}
	const hits: SettingsSearchHit[] = []
	for (const tab of visibleSettingsTabs(context)) {
		const tabHay = `${tab.label} ${tab.description}`.toLowerCase()
		const tabMatches = words.every((word) => tabHay.includes(word))
		for (const section of tab.sections) {
			const sectionHay =
				`${section.title} ${section.keywords}`.toLowerCase()
			const sectionMatches = words.every((word) =>
				sectionHay.includes(word)
			)
			if (tabMatches || sectionMatches) {
				hits.push({
					tabId: tab.id,
					tabLabel: tab.label,
					tabGroup: tab.group,
					sectionId: section.id,
					sectionTitle: section.title,
				})
			}
		}
	}
	return hits
}
