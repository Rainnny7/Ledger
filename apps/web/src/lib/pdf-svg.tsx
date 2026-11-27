import type { CSSProperties, ReactNode, SVGProps } from "react"

import {
	normalizeTakumiStyle,
	pointToCssPixel,
} from "@/lib/pdf-primitives-style"

/** `Svg` export. */
export const Svg = ({
	children,
	style,
	height,
	viewBox,
	width,
	...rest
}: SVGProps<SVGSVGElement> & { style?: CSSProperties }) => {
	const numericHeight = typeof height === "number" ? height : undefined
	const numericWidth = typeof width === "number" ? width : undefined

	return (
		<svg
			style={
				style
					? (normalizeTakumiStyle(
							style as Record<string, unknown>
						) as CSSProperties)
					: undefined
			}
			height={
				numericHeight === undefined
					? height
					: pointToCssPixel(numericHeight)
			}
			viewBox={
				viewBox ??
				(numericWidth !== undefined && numericHeight !== undefined
					? `0 0 ${numericWidth} ${numericHeight}`
					: undefined)
			}
			width={
				numericWidth === undefined
					? width
					: pointToCssPixel(numericWidth)
			}
			{...rest}
		>
			{children}
		</svg>
	)
}

/** `Rect` export. */
export const Rect = (props: SVGProps<SVGRectElement>) => <rect {...props} />
/** `Circle` export. */
export const Circle = (props: SVGProps<SVGCircleElement>) => (
	<circle {...props} />
)
/** `G` export. */
export const G = (props: SVGProps<SVGGElement>) => <g {...props} />
/** `Line` export. */
export const Line = (props: SVGProps<SVGLineElement>) => <line {...props} />
/** `Path` export. */
export const Path = (props: SVGProps<SVGPathElement>) => <path {...props} />
/** `SvgText` export. */
export const SvgText = ({
	children,
	style,
	...rest
}: SVGProps<SVGTextElement> & {
	children?: ReactNode
	style?: CSSProperties
}) => {
	const { fontFamily, fontSize, fontStyle, fontWeight, ...remainingStyle } =
		style ?? {}

	return (
		<text
			fontFamily={fontFamily ?? "sans-serif"}
			fontSize={fontSize}
			fontStyle={fontStyle}
			fontWeight={fontWeight}
			style={remainingStyle}
			{...rest}
		>
			{children}
		</text>
	)
}
