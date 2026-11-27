import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/*
 * Better Auth's tables. Column names are Better Auth's own (camelCase) and dates are ISO-8601 text,
 * which is what its adapter writes for string columns.
 */

/** Accounts, plus the admin plugin's role/ban fields and the app's own profile preferences. */
export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
	image: text("image"),
	createdAt: text("createdAt").notNull(),
	updatedAt: text("updatedAt").notNull(),
	twoFactorEnabled: integer("twoFactorEnabled", { mode: "boolean" }).default(
		false
	),
	role: text("role"),
	banned: integer("banned", { mode: "boolean" }).default(false),
	banReason: text("banReason"),
	banExpires: text("banExpires"),
	mustChangePassword: integer("mustChangePassword", {
		mode: "boolean",
	}).default(false),
	includeOverdraft: integer("includeOverdraft", { mode: "boolean" }).default(
		true
	),
	hideAiSuggestions: integer("hideAiSuggestions", { mode: "boolean" }).default(
		false
	),
	currency: text("currency"),
	theme: text("theme"),
	accent: text("accent"),
	/** Set after the user finishes or skips first-login onboarding (ISO-8601). */
	onboardingCompletedAt: text("onboardingCompletedAt"),
})

/** Logged-in devices. */
export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: text("expiresAt").notNull(),
		token: text("token").notNull().unique(),
		createdAt: text("createdAt").notNull(),
		updatedAt: text("updatedAt").notNull(),
		ipAddress: text("ipAddress"),
		userAgent: text("userAgent"),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		impersonatedBy: text("impersonatedBy"),
	},
	(table) => [index("session_userId_idx").on(table.userId)]
)

/** Credentials per login provider (the password hash lives here). */
export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("accountId").notNull(),
		providerId: text("providerId").notNull(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("accessToken"),
		refreshToken: text("refreshToken"),
		idToken: text("idToken"),
		accessTokenExpiresAt: text("accessTokenExpiresAt"),
		refreshTokenExpiresAt: text("refreshTokenExpiresAt"),
		scope: text("scope"),
		password: text("password"),
		createdAt: text("createdAt").notNull(),
		updatedAt: text("updatedAt").notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)]
)

/** One-time codes and tokens (email verification, password reset). */
export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: text("expiresAt").notNull(),
		createdAt: text("createdAt").notNull(),
		updatedAt: text("updatedAt").notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)]
)

/** Two-factor (TOTP) secrets and backup codes. */
export const twoFactor = sqliteTable(
	"twoFactor",
	{
		id: text("id").primaryKey(),
		secret: text("secret").notNull(),
		backupCodes: text("backupCodes").notNull(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		verified: integer("verified", { mode: "boolean" }),
		failedVerificationCount: integer("failedVerificationCount"),
		lockedUntil: text("lockedUntil"),
	},
	(table) => [
		index("twoFactor_secret_idx").on(table.secret),
		index("twoFactor_userId_idx").on(table.userId),
	]
)

/**
 * Personal API keys (Better Auth's API key plugin). Only a SHA-256 hash of each key is stored in
 * `key`; the plaintext is shown once at creation. `referenceId` is the owning user.
 */
export const apikey = sqliteTable(
	"apikey",
	{
		id: text("id").primaryKey(),
		configId: text("configId").notNull().default("default"),
		name: text("name"),
		start: text("start"),
		referenceId: text("referenceId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		prefix: text("prefix"),
		key: text("key").notNull(),
		refillInterval: integer("refillInterval"),
		refillAmount: integer("refillAmount"),
		lastRefillAt: text("lastRefillAt"),
		enabled: integer("enabled", { mode: "boolean" }).default(true),
		rateLimitEnabled: integer("rateLimitEnabled", {
			mode: "boolean",
		}).default(true),
		rateLimitTimeWindow: integer("rateLimitTimeWindow"),
		rateLimitMax: integer("rateLimitMax"),
		requestCount: integer("requestCount").default(0),
		remaining: integer("remaining"),
		lastRequest: text("lastRequest"),
		expiresAt: text("expiresAt"),
		createdAt: text("createdAt").notNull(),
		updatedAt: text("updatedAt").notNull(),
		permissions: text("permissions"),
		metadata: text("metadata"),
	},
	(table) => [
		index("apikey_configId_idx").on(table.configId),
		index("apikey_referenceId_idx").on(table.referenceId),
		index("apikey_key_idx").on(table.key),
	]
)
