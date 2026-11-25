import { Hint } from "@/components/common/hint"
import { useUpdate } from "@/lib/queries"

/** Running version and whether GitHub reports something newer. */
export function UpdateStatus() {
  const { data, isError, isPending } = useUpdate(true)
  if (isPending) {
    return (
      <span className="text-xs text-muted-foreground">
        Checking for updates…
      </span>
    )
  }
  const current = data?.current ?? "—"
  let detail = isError ? "check failed" : "up to date"
  if (data?.available && data.latest) detail = `v${data.latest} available`
  else if (data?.latest && !data.available) detail = "up to date"
  return (
    <Hint label={`Ledger ${current} · ${detail}`}>
      <span className="cursor-default text-xs text-muted-foreground">
        v{current} · {detail}
      </span>
    </Hint>
  )
}
