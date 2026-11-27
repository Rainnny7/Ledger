import { usePdfcnTheme, useSafeMemo } from "@/components/pdf/theme-provider"
import { Text as PDFText } from "@/lib/pdf-primitives"
import { StyleSheet, type Style } from "@/lib/pdf-primitives-style"
import { resolveColor } from "@/lib/resolve-color"
import type { PDFComponentProps } from "@/types/pdf-components"
import type { PdfcnTheme } from "@/types/pdf-themes"

/** Shape for `TextVariant` used across this module. */
export type TextVariant = "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl"
/** Shape for `TextWeight` used across this module. */
export type TextWeight = "normal" | "medium" | "semibold" | "bold"
/** Shape for `TextDecoration` used across this module. */
export type TextDecoration = "underline" | "line-through" | "none"

/**
 * Body text with typography scale, alignment, and decoration options.
 * Props - `variant` | `align` | `color` | `weight` | `italic` | `decoration` | `transform` | `noMargin` | `children` | `style`
 * @see {@link TextProps}
 */
export interface TextProps extends PDFComponentProps {
	/**
	 * @default 'base'
	 */
	variant?: TextVariant
	/**
	 * @default 'left'
	 */
	align?: "left" | "center" | "right" | "justify"
	color?: string
	/**
	 * @default 'normal'
	 */
	weight?: TextWeight
	/**
	 * @default false
	 */
	italic?: boolean
	/**
	 * @default 'none'
	 */
	decoration?: TextDecoration
	transform?: "uppercase" | "lowercase" | "capitalize"
	/**
	 * @default false
	 */
	noMargin?: boolean
}

const createTextStyles = (theme: PdfcnTheme) => {
	const { fontWeights, letterSpacing } = theme.primitives
	const base = {
		color: theme.colors.foreground,
		fontFamily: theme.typography.body.fontFamily,
		lineHeight: theme.typography.body.lineHeight,
		marginBottom: theme.spacing.paragraphGap,
		marginTop: 0,
	}
	return StyleSheet.create({
		"2xl": { ...base, fontSize: theme.primitives.typography["2xl"] },
		"3xl": { ...base, fontSize: theme.primitives.typography["3xl"] },
		base: { ...base, fontSize: theme.primitives.typography.base },
		capitalize: { textTransform: "capitalize" },
		decorationNone: { textDecoration: "none" },
		italic: { fontStyle: "italic" },
		lg: { ...base, fontSize: theme.primitives.typography.lg },
		lineThrough: { textDecoration: "line-through" },
		lowercase: { textTransform: "lowercase" },
		noMargin: { marginBottom: 0, marginTop: 0 },
		sm: { ...base, fontSize: theme.primitives.typography.sm },
		text: { ...base, fontSize: theme.typography.body.fontSize },
		underline: { textDecoration: "underline" },
		uppercase: {
			letterSpacing: letterSpacing.wider * 10,
			textTransform: "uppercase",
		},
		weightBold: { fontWeight: fontWeights.bold },
		weightMedium: { fontWeight: fontWeights.medium },
		weightNormal: { fontWeight: fontWeights.regular },
		weightSemibold: { fontWeight: fontWeights.semibold },
		xl: { ...base, fontSize: theme.primitives.typography.xl },
		xs: { ...base, fontSize: theme.primitives.typography.xs },
	})
}

/** `Text` helper or constant for this feature area. */
export const Text = ({
	variant,
	align,
	color,
	weight,
	italic,
	decoration,
	transform,
	noMargin,
	children,
	style,
}: TextProps) => {
	const theme = usePdfcnTheme()
	const styles = useSafeMemo(() => createTextStyles(theme), [theme])
	const weightMap = {
		bold: styles.weightBold,
		medium: styles.weightMedium,
		normal: styles.weightNormal,
		semibold: styles.weightSemibold,
	}
	const decorationMap = {
		"line-through": styles.lineThrough,
		none: styles.decorationNone,
		underline: styles.underline,
	}
	const transformMap = {
		capitalize: styles.capitalize,
		lowercase: styles.lowercase,
		uppercase: styles.uppercase,
	}
	const styleArray: Style[] = [variant ? styles[variant] : styles.text]
	if (weight && weight in weightMap) {
		styleArray.push(weightMap[weight])
	}
	if (italic) {
		styleArray.push(styles.italic)
	}
	if (decoration && decoration in decorationMap) {
		styleArray.push(decorationMap[decoration])
	}
	if (transform && transform in transformMap) {
		styleArray.push(transformMap[transform])
	}
	if (noMargin) {
		styleArray.push(styles.noMargin)
	}
	const semantic = {} as Style
	if (align) {
		semantic.textAlign = align
	}
	if (color) {
		semantic.color = resolveColor(color, theme.colors)
	}
	if (Object.keys(semantic).length > 0) {
		styleArray.push(semantic)
	}
	if (style) {
		styleArray.push(...[style].flat())
	}
	return <PDFText style={styleArray}>{children}</PDFText>
}
