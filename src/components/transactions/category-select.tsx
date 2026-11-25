import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Category } from "@/lib/api"
import { CATEGORY_LIST, CATEGORY_META } from "@/lib/categories"

const categoryItems = CATEGORY_LIST.map((c) => ({
  value: c,
  label: CATEGORY_META[c].label,
}))

export function CategorySelect({
  value,
  onChange,
}: {
  value: Category
  onChange: (v: Category) => void
}) {
  return (
    <Select
      items={categoryItems}
      value={value}
      onValueChange={(v) => v && onChange(v as Category)}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CATEGORY_LIST.map((c) => {
          const Icon = CATEGORY_META[c].icon
          return (
            <SelectItem key={c} value={c}>
              <Icon /> {CATEGORY_META[c].label}
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
