import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { currencyName, currencyOptions } from '@/lib/currency'
import { cn } from '@/lib/utils'

/** A currency picker: "USD · US Dollar" in the list, the code alone once picked. */
export function CurrencySelect({
  id,
  value,
  onChange,
  className,
  disabled,
}: {
  id?: string
  value: string
  onChange: (code: string) => void
  className?: string
  disabled?: boolean
}) {
  const options = currencyOptions(value)
  return (
    <Select items={options.map((c) => ({ value: c, label: c }))} value={value} onValueChange={(v) => v && onChange(v)} disabled={disabled}>
      <SelectTrigger id={id} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((c) => (
          <SelectItem key={c} value={c}>
            <span className="font-medium">{c}</span>
            <span className="text-muted-foreground">{currencyName(c)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
