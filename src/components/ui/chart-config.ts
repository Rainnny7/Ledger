import type * as React from "react"

const THEMES = { light: "", dark: ".dark" } as const

/** `ChartConfig` type used in this module. */
export type ChartConfig = Record<
	string,
	{
		label?: React.ReactNode
		icon?: React.ComponentType
	} & (
		| { color?: string; theme?: never }
		| { color?: never; theme: Record<keyof typeof THEMES, string> }
	)
>
