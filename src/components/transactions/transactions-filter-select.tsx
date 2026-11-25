import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function TransactionsFilterSelect({
  items,
  value,
  onChange,
  className,
}: {
  items: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => v && onChange(v as string)}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
