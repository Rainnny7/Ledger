import { isValidElement } from "react"
import type { DependencyList, ReactNode } from "react"

import { professionalTheme } from "@/lib/pdf-themes/professional"

/** Active PDF layout theme tokens (colors, spacing, typography). */
export type PdfcnTheme = typeof professionalTheme

let serializedTheme = professionalTheme

/** Wraps PDF blocks so {@link usePdfcnTheme} resolves during render-to-bytes. */
export interface PdfcnThemeProviderProps {
	theme?: PdfcnTheme
	children: ReactNode
}

const renderForSerializer = (
	children: ReactNode,
	theme: PdfcnTheme
): ReactNode => {
	serializedTheme = theme

	if (!isValidElement(children) || typeof children.type !== "function") {
		return children
	}

	return (children.type as (props: unknown) => ReactNode)(children.props)
}

/** Sets the serialized theme used while the PDF tree is walked for output. */
export const PdfcnThemeProvider = ({
	theme,
	children,
}: PdfcnThemeProviderProps) =>
	renderForSerializer(children, theme ?? professionalTheme)

/** Returns the theme currently being rendered into a PDF document. */
export const usePdfcnTheme = (): PdfcnTheme => serializedTheme

/**
 * No-op memo shim: PDF render is single-pass, so factories run each render.
 */
export const useSafeMemo = <T,>(factory: () => T, _deps: DependencyList): T =>
	factory()
