/**
 * The AI's part of the spending digest: a few sentences of commentary around figures the code
 * already computed. The model gets only the aggregates and flagged items (no account numbers, no
 * transaction lists), and any line that quotes a number it wasn't given is thrown away.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText } from "ai"
import { z } from "zod"
import { env } from "../config/env.ts"
import type { SpendingDigest } from "../finance/spending-digest.ts"

/** The wording the email shows next to the computed figures; every field is optional because a line can be dropped. */
export interface DigestProse {
	headline?: string
	spending?: string
	trend?: string
	unusual?: string
	recurring?: string
	suggestion?: string
}

const PROSE_KEYS = [
	"headline",
	"spending",
	"trend",
	"unusual",
	"recurring",
	"suggestion",
] as const

const proseSchema = z.object({
	headline: z.string().optional(),
	spending: z.string().optional(),
	trend: z.string().optional(),
	unusual: z.string().optional(),
	recurring: z.string().optional(),
	suggestion: z.string().optional(),
})

const AI_TIMEOUT_MS = 45_000
const MAX_LINE_LENGTH = 400

const SYSTEM_PROMPT = [
	"You write the short commentary in a monthly personal-spending email. You are given JSON of already-computed figures.",
	"Reply with a single JSON object and nothing else, with these string fields:",
	'"headline": a 1-2 sentence overall take on the month.',
	'"spending": one short line on where the money went (top categories and notable shifts).',
	'"trend": one short line on how this month compares with last month and the 3-month trend.',
	'"unusual": one short line on the unusual items, or "" if there are none.',
	'"recurring": one short line on new or pricier recurring charges, or "" if there are none.',
	'"suggestion": one specific, low-pressure suggestion based on the data.',
	"Rules: be warm and plain-spoken; never shame. Do not invent numbers. Only quote figures that appear in the JSON, exactly as given, and prefer words over numbers when unsure. No markdown, no emoji, no greetings.",
].join("\n")

/** Every figure in the digest, as the forms a sentence might reasonably quote it in. */
function allowedNumberTokens(digest: SpendingDigest): Set<string> {
	const allowed = new Set<string>()
	const addNumber = (value: number) => {
		const magnitude = Math.abs(value)
		allowed.add(String(magnitude))
		allowed.add(magnitude.toFixed(0))
		allowed.add(magnitude.toFixed(1))
		allowed.add(magnitude.toFixed(2))
		allowed.add(Math.round(magnitude).toLocaleString("en-US"))
		allowed.add(
			magnitude.toLocaleString("en-US", { minimumFractionDigits: 2 })
		)
		allowed.add(
			magnitude.toLocaleString("en-US", { maximumFractionDigits: 2 })
		)
	}
	const walk = (value: unknown) => {
		if (typeof value === "number") {
			addNumber(value)
		} else if (typeof value === "string") {
			for (const token of numberTokens(value)) {
				allowed.add(token)
			}
		} else if (Array.isArray(value)) {
			value.forEach(walk)
		} else if (value && typeof value === "object") {
			Object.values(value).forEach(walk)
		}
	}
	walk(digest)
	return allowed
}

/** The numbers written in a piece of text, without currency symbols or thousands commas. */
function numberTokens(text: string): string[] {
	return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((token) =>
		token.replaceAll(",", "")
	)
}

/**
 * Whether a line only quotes numbers that came from the digest. Plain small integers ("3 months",
 * "2 charges") are let through unless they're a percentage or an amount.
 */
export function isGroundedProse(line: string, digest: SpendingDigest): boolean {
	const allowed = allowedNumberTokens(digest)
	for (const match of line.matchAll(/([$€£]?)(\d[\d,]*(?:\.\d+)?)(\s?%?)/g)) {
		const token = match[2].replaceAll(",", "")
		const isMeasure = match[1] !== "" || match[3].trim() === "%"
		const isSmallCount = !isMeasure && /^\d{1,2}$/.test(token)
		if (!allowed.has(token) && !isSmallCount) {
			return false
		}
	}
	return true
}

/** Keeps the lines that are well-formed and grounded in the digest's own numbers. */
export function sanitizeProse(
	raw: z.infer<typeof proseSchema>,
	digest: SpendingDigest
): DigestProse {
	const prose: DigestProse = {}
	for (const key of PROSE_KEYS) {
		const line = raw[key]?.replaceAll(/\s+/g, " ").trim()
		if (!line || line.length > MAX_LINE_LENGTH) {
			continue
		}
		if (isGroundedProse(line, digest)) {
			prose[key] = line
		} else {
			console.warn(
				`[digest] dropped an AI line quoting unknown numbers (${key})`
			)
		}
	}
	return prose
}

/** Pulls the JSON object out of a model reply, tolerating a code fence or stray words around it. */
function parseProseJson(text: string) {
	const start = text.indexOf("{")
	const end = text.lastIndexOf("}")
	if (start === -1 || end <= start) {
		throw new Error("The AI reply had no JSON object")
	}
	return proseSchema.parse(JSON.parse(text.slice(start, end + 1)))
}

/**
 * Asks the AI gateway for the digest's wording. Throws on any failure (network, bad reply); callers
 * send the email without prose in that case.
 */
export async function generateDigestProse(
	digest: SpendingDigest
): Promise<DigestProse> {
	const gateway = createOpenAICompatible({
		name: "ai-gateway",
		baseURL: env.AI_BASE_URL,
		apiKey: env.AI_API_KEY,
	})
	const { text } = await generateText({
		model: gateway(env.AI_MODEL),
		system: SYSTEM_PROMPT,
		prompt: JSON.stringify(digest),
		abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
	})
	return sanitizeProse(parseProseJson(text), digest)
}
