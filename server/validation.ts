/** Request-body building blocks shared by every route, so a date or currency means the same thing everywhere. */
import { z } from 'zod'

/** A real calendar day as YYYY-MM-DD (rejects 2024-02-30, 2024-13-01…), within a sane range. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= '1900-01-01' && s <= '2199-12-31'
  }, 'Not a real date')

const ISO_CURRENCIES = new Set(Intl.supportedValuesOf('currency'))

/** An ISO 4217 code, any case in, upper case out. */
export const currencyCode = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((s) => s.toUpperCase())
  .refine((s) => ISO_CURRENCIES.has(s), 'Unknown currency')

export const isCurrencyCode = (v: unknown): v is string => typeof v === 'string' && ISO_CURRENCIES.has(v)
