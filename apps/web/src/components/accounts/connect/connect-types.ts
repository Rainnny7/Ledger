import type { ConnectStep } from "@/lib/api"

/** Shape for `Phase` used across this module. */
export type Phase =
	| { type: "pick" }
	| { type: "td-method" }
	| { type: "form"; error?: string }
	| ConnectStep
