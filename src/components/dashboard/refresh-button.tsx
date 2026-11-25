import { Hint } from "@/components/common/hint"
import { RefreshCWIcon } from "@/components/icons/refresh-cw"
import { useAnimatedIcon } from "@/components/icons/use-animated-icon"
import { Button } from "@/components/ui/button"

/** Refresh, with the arrows spinning while you hover it. */
export function RefreshButton({ onClick }: { onClick: () => void }) {
  const { ref: iconRef, handlers: iconHandlers } =
    useAnimatedIcon<HTMLButtonElement>()
  return (
    <Hint label="Fetch new transactions since the last sync">
      <Button
        variant="outline"
        size="sm"
        className="rounded-r-none"
        {...iconHandlers}
        onClick={onClick}
      >
        <RefreshCWIcon ref={iconRef} size={14} className="flex" /> Refresh
      </Button>
    </Hint>
  )
}
