import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A search box that keeps what you type to itself and only reports it once you pause, so a long
 * list isn't re-filtered (and the address rewritten) on every keystroke. When `value` changes from
 * outside (a "Clear" button, the back button) the box follows it.
 */
export function SearchInput({
  value,
  onChange,
  delay = 250,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  delay?: number
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  // The last value we've seen or reported, so an outside change can be told apart from our own.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const report = useRef(onChange)
  useEffect(() => {
    report.current = onChange
  })
  useEffect(() => () => clearTimeout(timer.current), [])

  function commit(next: string) {
    clearTimeout(timer.current)
    setSeen(next)
    report.current(next)
  }

  return (
    <div className={cn('relative min-w-48 flex-1', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        className="pl-8"
        value={draft}
        onChange={(e) => {
          const next = e.target.value
          setDraft(next)
          clearTimeout(timer.current)
          // Emptying the box shows everything again straight away.
          if (next === '') commit(next)
          else timer.current = setTimeout(() => commit(next), delay)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(draft)
        }}
      />
    </div>
  )
}
