import { encode } from "uqr"
import { cn } from "@/lib/utils"

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
  let d = ""
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`
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
      <path d={d} fill="#000" />
    </svg>
  )
}
