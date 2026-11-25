import { BriefcaseBusiness, Loader2, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  transactionRecategorizeItems,
  transactionRetagItems,
} from "@/components/transactions/transactions-filter-items"

export function TransactionsBulkToolbar({
  shownCount,
  filteredCount,
  allShownPicked,
  pickedCount,
  applying,
  onToggleAll,
  onRecategorize,
  onRetag,
}: {
  shownCount: number
  filteredCount: number
  allShownPicked: boolean
  pickedCount: number
  applying: boolean
  onToggleAll: () => void
  onRecategorize: (value: string) => void
  onRetag: (value: string) => void
}) {
  if (shownCount === 0) return null
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm">
      <Button variant="ghost" size="sm" onClick={onToggleAll}>
        {allShownPicked
          ? "Select none"
          : `Select ${shownCount === filteredCount ? "all" : `these ${shownCount}`}`}
      </Button>
      {pickedCount > 0 && (
        <>
          <span className="text-muted-foreground">{pickedCount} selected</span>
          <Select
            items={transactionRecategorizeItems}
            value={null}
            onValueChange={(v) => v && onRecategorize(v as string)}
          >
            <SelectTrigger size="sm" className="w-48" disabled={applying}>
              {applying ? <Loader2 className="animate-spin" /> : <Tags />}
              <SelectValue placeholder="Change category…" />
            </SelectTrigger>
            <SelectContent>
              {transactionRecategorizeItems.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={transactionRetagItems}
            value={null}
            onValueChange={(v) => v && onRetag(v as string)}
          >
            <SelectTrigger size="sm" className="w-44" disabled={applying}>
              <BriefcaseBusiness />
              <SelectValue placeholder="Tag for taxes…" />
            </SelectTrigger>
            <SelectContent>
              {transactionRetagItems.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  )
}
