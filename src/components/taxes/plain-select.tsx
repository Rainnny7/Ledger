import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function PlainSelect({
  items,
  value,
  onChange,
  className,
  label,
}: {
  items: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  className?: string
  label: string
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(v) => v && onChange(v as string)}
    >
      <SelectTrigger className={className} aria-label={label}>
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
