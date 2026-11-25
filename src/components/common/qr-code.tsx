import { encode } from "uqr"
import { cn } from "cn"

/** A QR code drawn as one SVG path: dark modules on a white quiet zone, so any scanner reads it in either theme. */
export function QrCode({
	value,
	label,
	className,
}: {
	value: string
	label: string
	className?: string
}) {
	const { data, size } = encode(value, { border: 1 })
	let pathData = ""
	data.forEach((row, y) =>
		row.forEach((on, x) => {
			if (on) {
				pathData += `M${x} ${y}h1v1h-1z`
			}
		})
	)
	return (
		<svg
			viewBox={`0 0 ${size} ${size}`}
			className={cn("bg-white", className)}
			role="img"
			aria-label={label}
			shapeRendering="crispEdges"
		>
			<path d={pathData} fill="#000" />
		</svg>
	)
}
