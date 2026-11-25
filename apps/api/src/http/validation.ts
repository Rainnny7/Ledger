/** Request-body building blocks shared by every route, so a date or currency means the same thing everywhere. */
import { z } from "zod"
import { roundMoney } from "@ledger/shared/money"

/** A real calendar day as YYYY-MM-DD (rejects 2024-02-30, 2024-13-01…), within a sane range. */
export const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((text) => {
		const date = new Date(`${text}T00:00:00Z`)
		return (
			!Number.isNaN(date.getTime()) &&
			date.toISOString().slice(0, 10) === text &&
			text >= "1900-01-01" &&
			text <= "2199-12-31"
		)
	}, "Not a real date")

const ISO_CURRENCIES = new Set(Intl.supportedValuesOf("currency"))

/** An ISO 4217 code, any case in, upper case out. */
export const currencyCode = z
	.string()
	.regex(/^[A-Za-z]{3}$/)
	.transform((code) => code.toUpperCase())
	.refine((code) => ISO_CURRENCIES.has(code), "Unknown currency")

/** Whether a string is a supported ISO 4217 currency code (uppercase). */
export const isCurrencyCode = (value: unknown): value is string =>
	typeof value === "string" && ISO_CURRENCIES.has(value)

/** Primary keys and foreign keys: UUID strings written by `randomUUID()`. */
export const id = z.string().uuid()

/** Public invoice share link token (`randomBytes(18)` base64url, 24 chars). */
export const token = z.string().regex(/^[A-Za-z0-9_-]{24}$/)

/** A monetary amount: finite, within ±1e9, snapped to a whole cent (absorbs float noise like 0.1 + 0.2). Writers store `toCents` of it. */
export const money = z
	.number()
	.finite()
	.refine((amount) => Math.abs(amount) <= 1e9, "Amount out of range")
	.transform(roundMoney)

/** Shared pagination query defaults for list routes. */
export const limit = z.coerce.number().int().min(1).max(500).default(100)
/** Shared pagination query defaults for list routes. */
export const offset = z.coerce.number().int().min(0).max(1_000_000).default(0)

/** Zod string schema capped at a max length. */
export const boundedString = (max: number) => z.string().max(max)
/** Zod array schema with a max item count. */
export const boundedArray = <T extends z.ZodType>(item: T, max: number) =>
	z.array(item).max(max)

/** Flatten a Zod failure into API-friendly issue objects. */
export const zodIssues = (error: z.ZodError) =>
	error.issues.map((issue) => ({
		path: issue.path.map(String).join("."),
		message: issue.message,
	}))

/** Standard 400 payload for invalid JSON bodies. */
export const invalidRequestBody = (
	issues: { path: string; message: string }[]
) => ({ error: "Invalid request", issues }) as const

/**
 * A JSON request body schema. A request with no body (or no JSON content type) is treated as an
 * empty object, so routes whose fields are all optional accept a bare POST.
 */
export const jsonBody = <T extends z.ZodType>(schema: T) =>
	z.preprocess((value) => (value === undefined ? {} : value), schema)
