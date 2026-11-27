import type { ReactNode, ImgHTMLAttributes, AnchorHTMLAttributes } from "react"
import { flatten, type StyleInput } from "@/lib/pdf-primitives-style"

interface ViewProps {
	children?: ReactNode
	style?: StyleInput
	className?: string
	wrap?: boolean
	fixed?: boolean
	break?: boolean
	minPresenceAhead?: number
}

/** Flex column container for PDF layout trees. */
export function View({ children, style, className, ...rest }: ViewProps) {
	const {
		wrap,
		fixed,
		break: pageBreak,
		minPresenceAhead: _minPresenceAhead,
		...dom
	} = rest as ViewProps & Record<string, unknown>
	const merged = {
		display: "flex",
		flexDirection: "column",
		...flatten(style),
	}
	if (pageBreak) {
		Object.assign(merged, { breakBefore: "page" })
	}
	if (wrap === false) {
		Object.assign(merged, { breakInside: "avoid" })
	}
	if (fixed) {
		Object.assign(merged, { position: "fixed" })
	}
	return (
		<div
			className={className}
			style={merged as React.CSSProperties}
			{...(dom as object)}
		>
			{children}
		</div>
	)
}

interface TextProps {
	children?: ReactNode
	style?: StyleInput
	className?: string
	render?: (info: { pageNumber: number; totalPages: number }) => ReactNode
	fixed?: boolean
	href?: string
	src?: string
}

/** Text or link node for PDF content. */
export function Text({
	children,
	style,
	className,
	render: _pageRender,
	href,
	src,
	...rest
}: TextProps) {
	const merged = flatten(style) as React.CSSProperties | undefined
	const link = href ?? src
	if (link) {
		return (
			<a
				href={link}
				className={className}
				style={merged}
				{...(rest as object)}
			>
				{children}
			</a>
		)
	}
	return (
		<span className={className} style={merged} {...(rest as object)}>
			{children}
		</span>
	)
}

/** Image node for PDF content. */
export function Image({
	src,
	style,
	...rest
}: {
	src: string | { uri: string }
	style?: StyleInput
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "style">) {
	const resolved = typeof src === "string" ? src : src.uri
	return (
		// eslint-disable-next-line eslint(nextjs/no-img-element) -- PDF primitive, not Next.js page
		<img
			src={resolved}
			style={flatten(style) as React.CSSProperties}
			alt=""
			{...rest}
		/>
	)
}

/** Hyperlink wrapper for PDF content. */
export function Link({
	src,
	children,
	style,
	...rest
}: {
	src: string
	children?: ReactNode
	style?: StyleInput
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "style">) {
	return (
		<a href={src} style={flatten(style) as React.CSSProperties} {...rest}>
			{children}
		</a>
	)
}

/** Root container for a PDF document definition. */
export function Document({
	children,
	title,
	style,
}: {
	children?: ReactNode
	title?: string
	style?: StyleInput
}) {
	return (
		<div
			data-pdf-document={title}
			style={
				{
					display: "flex",
					flexDirection: "column",
					...flatten(style),
				} as React.CSSProperties
			}
		>
			{children}
		</div>
	)
}

/** Single page within a PDF document. */
export function Page({
	children,
	size: _pageSize,
	style,
}: {
	children?: ReactNode
	size?: string | { width: number; height: number }
	style?: StyleInput
}) {
	return (
		<div
			data-pdf-page
			style={
				{
					display: "flex",
					flexDirection: "column",
					...flatten(style),
				} as React.CSSProperties
			}
		>
			{children}
		</div>
	)
}
