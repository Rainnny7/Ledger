/** CSS-like style record used by PDF layout primitives. */
export type Style = Record<string, unknown>

/** Style input accepted by primitives (single object, array merge, or skip). */
export type StyleInput = Style | Style[] | false | null | undefined

/**
 * pdfcn's shared component tokens follow the PDF convention of using points.
 * Takumi follows browser CSS instead, where numeric lengths are pixels at
 * 96 DPI. Converting at the primitive boundary keeps the public component API
 * and the generated document's physical measurements aligned with Forme.
 */
const PDF_POINT_TO_CSS_PIXEL = 96 / 72

/**
 * Converts a PDF point length to CSS pixels at 96 DPI.
 */
export function pointToCssPixel(value: number): number {
	return value * PDF_POINT_TO_CSS_PIXEL
}

/** Minimal StyleSheet helper matching react-pdf's API. */
export const StyleSheet = {
	/** Returns style objects unchanged; exists for react-pdf parity. */
	create<T extends Record<string, Style>>(styles: T): T {
		return styles
	},
}

const POINT_LENGTH_PROPERTIES = new Set([
	"blockSize",
	"borderBlockEndWidth",
	"borderBlockStartWidth",
	"borderBlockWidth",
	"borderBottomLeftRadius",
	"borderBottomRightRadius",
	"borderBottomWidth",
	"borderEndEndRadius",
	"borderEndStartRadius",
	"borderInlineEndWidth",
	"borderInlineStartWidth",
	"borderInlineWidth",
	"borderLeftWidth",
	"borderRadius",
	"borderRightWidth",
	"borderStartEndRadius",
	"borderStartStartRadius",
	"borderTopLeftRadius",
	"borderTopRightRadius",
	"borderTopWidth",
	"borderWidth",
	"bottom",
	"columnGap",
	"flexBasis",
	"fontSize",
	"gap",
	"height",
	"inlineSize",
	"inset",
	"insetBlock",
	"insetBlockEnd",
	"insetBlockStart",
	"insetInline",
	"insetInlineEnd",
	"insetInlineStart",
	"left",
	"letterSpacing",
	"margin",
	"marginBlock",
	"marginBlockEnd",
	"marginBlockStart",
	"marginBottom",
	"marginInline",
	"marginInlineEnd",
	"marginInlineStart",
	"marginLeft",
	"marginRight",
	"marginTop",
	"maxBlockSize",
	"maxHeight",
	"maxInlineSize",
	"maxWidth",
	"minBlockSize",
	"minHeight",
	"minInlineSize",
	"minWidth",
	"outlineOffset",
	"outlineWidth",
	"padding",
	"paddingBlock",
	"paddingBlockEnd",
	"paddingBlockStart",
	"paddingBottom",
	"paddingInline",
	"paddingInlineEnd",
	"paddingInlineStart",
	"paddingLeft",
	"paddingRight",
	"paddingTop",
	"right",
	"rowGap",
	"textDecorationThickness",
	"textIndent",
	"top",
	"width",
])

/**
 * Expands shorthand margin/padding and converts point lengths to CSS pixels.
 */
export function normalizeTakumiStyle(style: Style): Style {
	const {
		marginHorizontal,
		marginVertical,
		paddingHorizontal,
		paddingVertical,
		...normalized
	} = style

	if (marginHorizontal !== undefined) {
		normalized.marginLeft ??= marginHorizontal
		normalized.marginRight ??= marginHorizontal
	}
	if (marginVertical !== undefined) {
		normalized.marginBottom ??= marginVertical
		normalized.marginTop ??= marginVertical
	}
	if (paddingHorizontal !== undefined) {
		normalized.paddingLeft ??= paddingHorizontal
		normalized.paddingRight ??= paddingHorizontal
	}
	if (paddingVertical !== undefined) {
		normalized.paddingBottom ??= paddingVertical
		normalized.paddingTop ??= paddingVertical
	}

	const borderSides = ["Top", "Right", "Bottom", "Left"] as const
	if (normalized.borderWidth !== undefined) {
		normalized.borderStyle ??= "solid"
	}
	for (const side of borderSides) {
		if (normalized[`border${side}Width`] !== undefined) {
			normalized[`border${side}Style`] ??= "solid"
		}
	}

	return Object.fromEntries(
		Object.entries(normalized).map(([property, value]) => [
			property,
			typeof value === "number" && POINT_LENGTH_PROPERTIES.has(property)
				? pointToCssPixel(value)
				: value,
		])
	)
}

/**
 * Merges style input into a single normalized style object for the DOM.
 */
export function flatten(
	style?: StyleInput
): Record<string, unknown> | undefined {
	if (!style) {
		return undefined
	}
	if (Array.isArray(style)) {
		return normalizeTakumiStyle(Object.assign({}, ...style.filter(Boolean)))
	}
	return normalizeTakumiStyle(style)
}
