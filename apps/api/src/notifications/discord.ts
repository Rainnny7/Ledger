import { eq } from "drizzle-orm"
import { env } from "../config/env.ts"
import { db } from "../db/connection.ts"
import { user } from "../db/schema/index.ts"
import { decrypt, encrypt } from "../security/crypto.ts"
import type { NotificationKind } from "./service.ts"

const DISCORD_HOSTS = new Set([
	"discord.com",
	"discordapp.com",
	"ptb.discord.com",
	"canary.discord.com",
])

const WEBHOOK_PATH = /^\/api\/webhooks\/\d+\/[^/]+$/u

/** Sender name shown in Discord; the avatar is the PNG render of the app logo served from the web build. */
const DISCORD_USERNAME = "Ledger"

/** Embed accent colours aligned with Discord's palette. */
const KIND_COLORS: Record<NotificationKind, number> = {
	info: 0x5865f2,
	success: 0x57f287,
	warning: 0xfee75c,
	alert: 0xed4245,
}

/** Strict Discord webhook URL check to block SSRF and malformed values. */
export function parseDiscordWebhookUrl(value: string): string | null {
	const trimmed = value.trim()
	if (!trimmed) {
		return null
	}
	let parsed: URL
	try {
		parsed = new URL(trimmed)
	} catch {
		return null
	}
	if (parsed.protocol !== "https:") {
		return null
	}
	if (!DISCORD_HOSTS.has(parsed.hostname)) {
		return null
	}
	if (parsed.username || parsed.password) {
		return null
	}
	if (parsed.port !== "") {
		return null
	}
	if (parsed.search !== "" || parsed.hash !== "") {
		return null
	}
	if (!WEBHOOK_PATH.test(parsed.pathname)) {
		return null
	}
	return parsed.href.replace(/\/$/, "")
}

/** Returns the user's decrypted webhook URL, or null when unset. */
export function getDiscordWebhook(userId: string): string | null {
	const row = db
		.select({ discordWebhook: user.discordWebhook })
		.from(user)
		.where(eq(user.id, userId))
		.get()
	if (!row?.discordWebhook) {
		return null
	}
	try {
		return decrypt<string>(row.discordWebhook)
	} catch (error) {
		console.warn(
			`Discord webhook decrypt failed for ${userId}:`,
			error instanceof Error ? error.message : error
		)
		return null
	}
}

/** Saves or clears the user's encrypted Discord webhook URL. */
export function setDiscordWebhook(userId: string, url: string | null): void {
	db.update(user)
		.set({
			discordWebhook: url ? encrypt(url) : null,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(user.id, userId))
		.run()
}

export interface DiscordNotificationPayload {
	title: string
	body: string
	kind: NotificationKind
	href?: string | null
}

function resolveEmbedUrl(href: string | null | undefined): string | undefined {
	const raw = href?.trim()
	if (!raw) {
		return undefined
	}
	if (/^https?:\/\//i.test(raw)) {
		return raw
	}
	const path = raw.startsWith("/") ? raw : `/${raw}`
	return `${env.PUBLIC_URL}${path}`
}

type DiscordPostBody = {
	username: string
	avatar_url: string
	embeds: Array<{
		title: string
		description: string
		color: number
		url?: string
	}>
	allowed_mentions: { parse: [] }
}

type DiscordFetch = (
	webhookUrl: string,
	body: DiscordPostBody
) => Promise<Response>

async function defaultDiscordFetch(
	webhookUrl: string,
	body: DiscordPostBody
): Promise<Response> {
	return fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		redirect: "error",
		signal: AbortSignal.timeout(10_000),
	})
}

/** Test hook: replace outbound Discord webhook posts. */
export let notificationDiscordSender: DiscordFetch = defaultDiscordFetch

/** @internal Replaces the sender used by {@link sendDiscordNotification} (tests). */
export function setNotificationDiscordSender(sender: DiscordFetch): void {
	notificationDiscordSender = sender
}

/**
 * Posts a notification embed to a Discord webhook. Logs failures and never throws;
 * returns whether Discord accepted the payload.
 */
export async function sendDiscordNotification(
	webhookUrl: string,
	payload: DiscordNotificationPayload
): Promise<boolean> {
	const embedUrl = resolveEmbedUrl(payload.href)
	const body: DiscordPostBody = {
		username: DISCORD_USERNAME,
		avatar_url: `${env.PUBLIC_URL}/logo-512.png`,
		embeds: [
			{
				title: payload.title.slice(0, 256),
				description: payload.body.slice(0, 4000),
				color: KIND_COLORS[payload.kind] ?? KIND_COLORS.info,
				...(embedUrl ? { url: embedUrl } : {}),
			},
		],
		allowed_mentions: { parse: [] },
	}
	try {
		const response = await notificationDiscordSender(webhookUrl, body)
		if (!response.ok) {
			console.warn(
				`Discord notification failed (${response.status}):`,
				await response.text().catch(() => "")
			)
			return false
		}
		return true
	} catch (error) {
		console.warn(
			"Discord notification failed:",
			error instanceof Error ? error.message : error
		)
		return false
	}
}
