/** The server's built-in demo users (one per persona); they hold sample data, not real accounts. */
export const isDemoEmail = (email: string) =>
	/^demo(-[a-z]+)?@ledger\.invalid$/.test(email)

/** Admin User. */
export interface AdminUser {
	id: string
	name: string
	email: string
	role?: string | null
	banned?: boolean | null
	twoFactorEnabled?: boolean | null
	mustChangePassword?: boolean | null
	createdAt: Date | string
}

/** State and handlers for rs key. */
export const usersKey = ["admin", "users"] as const
/** settingsKey. */
export const settingsKey = ["admin", "settings"] as const

/** Enforced AI chat limits (read-only in Admin). */
export interface AiChatLimits {
	messagesPerConversation: number
	maxConversationChars: number
	chatRequestsPerTenMinutes: number
	followUpSuggestionsPerTenMinutes: number
	maxToolStepsPerAnswer: number
	suggestionsMessageSlice: number
}

/** AI chat status for admins (never includes secrets). */
export interface AdminAiChatSettings {
	configured: boolean
	enabled: boolean
	model: string
	limits: AiChatLimits
}

/** Where updates come from: the latest release or the dev branch. */
export type ReleaseChannel = "stable" | "dev"

/** Admin Settings. */
export interface AdminSettings {
	registrationOpen: boolean
	/** The account that set this Ledger up: only it can manage admins or its own account. */
	ownerId: string | null
	aiChat: AdminAiChatSettings
	mcp: { enabled: boolean }
	releaseChannel: ReleaseChannel
}

/** User dialog. */
export type UserDialog =
	| { type: "add" }
	| { type: "password"; user: AdminUser }
	| { type: "role"; user: AdminUser }
	| { type: "delete"; user: AdminUser }
	| { type: "ban"; user: AdminUser }
