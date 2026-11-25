import { parseIso } from "@/lib/format"

export function SubscriptionDateChip({ iso }: { iso: string }) {
  const d = parseIso(iso)
  return (
    <span className="flex w-10 shrink-0 flex-col items-center rounded-md border py-0.5 leading-tight">
      <span className="text-[10px] font-medium text-muted-foreground uppercase">
        {d.toLocaleDateString("en-CA", { month: "short" })}
      </span>
      <span className="text-sm font-semibold tabular-nums">{d.getDate()}</span>
    </span>
  )
}
