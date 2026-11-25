/** Request-body building blocks shared by every route, so a date or currency means the same thing everywhere. */
import { validator } from "hono/validator"
import type { Context, Env, MiddlewareHandler } from "hono"
import { z } from "zod"
import { roundMoney } from "../shared/money.ts"

type SchemaIn<T extends z.ZodType> = z.input<T>
type SchemaOut<T extends z.ZodType> = z.output<T>

const JSON_MEDIA = /^application\/([\w.-]+\+)?json$/i

/** A real calendar day as YYYY-MM-DD (rejects 2024-02-30, 2024-13-01…), within a sane range. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return (
      !Number.isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === s &&
      s >= "1900-01-01" &&
      s <= "2199-12-31"
    )
  }, "Not a real date")

const ISO_CURRENCIES = new Set(Intl.supportedValuesOf("currency"))

/** An ISO 4217 code, any case in, upper case out. */
export const currencyCode = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((s) => s.toUpperCase())
  .refine((s) => ISO_CURRENCIES.has(s), "Unknown currency")

export const isCurrencyCode = (v: unknown): v is string =>
  typeof v === "string" && ISO_CURRENCIES.has(v)

/** Primary keys and foreign keys: UUID strings written by `randomUUID()`. */
export const id = z.string().uuid()

/** Public invoice share link token (`randomBytes(18)` base64url, 24 chars). */
export const token = z.string().regex(/^[A-Za-z0-9_-]{24}$/)

/** A monetary amount: finite, within ±1e9, snapped to a whole cent (absorbs float noise like 0.1 + 0.2). Writers store `toCents` of it. */
export const money = z
  .number()
  .finite()
  .refine((n) => Math.abs(n) <= 1e9, "Amount out of range")
  .transform(roundMoney)

export const limit = z.coerce.number().int().min(1).max(500).default(100)
export const offset = z.coerce.number().int().min(0).max(1_000_000).default(0)

export const boundedString = (max: number) => z.string().max(max)
export const boundedArray = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).max(max)

export type ValidateTarget = "json" | "query" | "param" | "form"

export const zodIssues = (error: z.ZodError) =>
  error.issues.map((i) => ({
    path: i.path.map(String).join("."),
    message: i.message,
  }))

export const invalidRequestBody = (
  issues: { path: string; message: string }[]
) => ({ error: "Invalid request", issues }) as const

function reject<T extends z.ZodType>(
  value: unknown,
  schema: T,
  c: Context
): z.infer<T> | Response {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    return c.json(invalidRequestBody(zodIssues(parsed.error)), 400)
  return parsed.data
}

/** Hono middleware: parse `target` with Zod 4 (strip unknown keys on objects) and set `c.req.valid(target)`. */
export function validate<
  T extends z.ZodType,
  Target extends ValidateTarget,
  E extends Env = Env,
  P extends string = string,
>(
  target: Target,
  schema: T
): MiddlewareHandler<
  E,
  P,
  {
    in: { [K in Target]: SchemaIn<T> }
    out: { [K in Target]: SchemaOut<T> }
  }
> {
  if (target === "json") {
    return async (c, next) => {
      let value: unknown = {}
      const raw = c.req
        .header("Content-Type")
        ?.split(";")[0]
        .trim()
        .toLowerCase()
      if (raw && JSON_MEDIA.test(raw)) {
        try {
          value = await c.req.json()
        } catch {
          return c.json(
            invalidRequestBody([{ path: "", message: "Malformed JSON" }]),
            400
          )
        }
      }
      const data = reject(value, schema, c)
      if (data instanceof Response) return data
      c.req.addValidatedData("json", data as object)
      await next()
    }
  }
  return validator(target, (value, c) => {
    const data = reject(value, schema, c)
    if (data instanceof Response) return data
    return data
  }) as MiddlewareHandler<
    E,
    P,
    {
      in: { [K in Target]: SchemaIn<T> }
      out: { [K in Target]: SchemaOut<T> }
    }
  >
}
