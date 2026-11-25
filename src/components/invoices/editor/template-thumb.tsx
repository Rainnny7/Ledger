import { cn } from "cn"

function templateThumbBar(w: string, h = "h-1", c = "bg-muted-foreground/25") {
  return <span className={cn("block rounded-full", w, h, c)} />
}

/** A tiny sketch of each template's layout, in the chosen colour. */
export function TemplateThumb({
  template,
  color,
}: {
  template: string
  color: string
}) {
  const bar = templateThumbBar
  return (
    <span
      aria-hidden
      className="grid aspect-[3/4] w-full content-start gap-1 rounded-md border bg-background p-1.5"
    >
      {template === "modern" && (
        <span
          className="block h-3 rounded-sm"
          style={{ backgroundColor: color }}
        />
      )}
      {template === "minimal" && (
        <span className="flex items-start justify-between">
          {bar("w-1/2", "h-1.5")}
          <span
            className="block size-3 rounded-sm border-2"
            style={{ borderColor: color }}
          />
        </span>
      )}
      {template === "classic" && (
        <span
          className="flex justify-between border-b pb-1"
          style={{ borderColor: color }}
        >
          <span
            className="block h-1.5 w-1/3 rounded-full"
            style={{ backgroundColor: color }}
          />
          {bar("w-1/4")}
        </span>
      )}
      <span className="mt-1 grid gap-0.5">
        {template === "modern" ? (
          <span
            className="block h-1 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : (
          bar("w-full", "h-1", "bg-muted-foreground/40")
        )}
        {bar("w-full")}
        {bar("w-full")}
        {bar("w-3/4")}
      </span>
      <span className="mt-1 ml-auto grid w-1/2 gap-0.5">
        {bar("w-full")}
        <span
          className="block h-1 rounded-full"
          style={{ backgroundColor: color }}
        />
      </span>
    </span>
  )
}
