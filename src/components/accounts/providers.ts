import type { ComponentType } from "react"
import { PaypalMark } from "@/components/logos/paypal-mark"

/** Shape for `ProviderId` used across this module. */
export type ProviderId = "td" | "paypal"

/** Everything the UI needs to know about each provider Ledger can connect to. */
export const PROVIDERS: Record<
	ProviderId,
	{
		label: string
		blurb: string
		history: string
		color: string
		mark: string
		/** The provider's own logo, shown on a light tile instead of the monogram. */
		logo?: ComponentType<{ className?: string }>
		keepsSecret: boolean
	}
> = {
	td: {
		label: "TD EasyWeb",
		blurb: "Chequing, savings, credit cards and loans",
		history: "up to 18 months",
		color: "#008a00",
		mark: "TD",
		keepsSecret: false,
	},
	paypal: {
		label: "PayPal",
		blurb: "Your PayPal balance and payments, via a REST API app",
		history: "up to 3 years",
		color: "#003087",
		mark: "P",
		logo: PaypalMark,
		keepsSecret: true,
	},
}

/** `isProviderId` helper or constant for this feature area. */
export const isProviderId = (v: string): v is ProviderId => v in PROVIDERS
