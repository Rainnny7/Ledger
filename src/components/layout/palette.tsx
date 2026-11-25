import { ArrowRight, Clock, CornerDownLeft, Plus, Search } from "lucide-react"
import type { PaletteItem } from "@/components/layout/command-palette-data"
import { usePalette } from "@/components/layout/use-palette"
import { cn } from "cn"

export function Palette({ onDone }: { onDone: () => void }) {
  const { query, setQuery, setActive, listRef, items, current, go } =
    usePalette({ onDone })

  return (
    <div className="flex max-h-[min(34rem,70svh)] flex-col">
      <div className="flex items-center gap-2.5 border-b px-3.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Search className="size-4" />
        </span>
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (!items.length) return
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setActive((current + 1) % items.length)
            } else if (e.key === "ArrowUp") {
              e.preventDefault()
              setActive((current - 1 + items.length) % items.length)
            } else if (e.key === "Enter") {
              e.preventDefault()
              go(items[current])
            }
          }}
          placeholder="Search, type an amount, or > for actions…"
          aria-label="Search"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={
            items[current] ? `palette-${current}` : undefined
          }
          className="h-13 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] text-muted-foreground sm:inline">
          Esc
        </kbd>
      </div>
      <PaletteList
        listRef={listRef}
        items={items}
        current={current}
        setActive={setActive}
        go={go}
      />
      <div className="flex items-center gap-3 border-t bg-muted/40 px-3.5 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Key>↑</Key>
          <Key>↓</Key> move
        </span>
        <span className="flex items-center gap-1">
          <Key>↵</Key> open
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          <Key>&gt;</Key> actions only
        </span>
        <span className="ml-auto truncate">
          Try <span className="font-medium text-primary">42.50</span> to find a
          transaction
        </span>
      </div>
    </div>
  )
}

function PaletteList({
  listRef,
  items,
  current,
  setActive,
  go,
}: {
  listRef: React.RefObject<HTMLDivElement | null>
  items: PaletteItem[]
  current: number
  setActive: (n: number | ((c: number) => number)) => void
  go: (item: PaletteItem | undefined) => void
}) {
  return (
    <div
      ref={listRef}
      id="palette-list"
      role="listbox"
      className="min-h-0 flex-1 overflow-y-auto p-1.5"
    >
      {items.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          No actions match.
        </p>
      )}
      {items.map((item, i) => {
        const heading = item.group !== items[i - 1]?.group ? item.group : null
        const Icon = item.group === "Recent" ? Clock : item.icon
        const on = i === current
        const doing = item.group === "Actions" || item.group === "Suggested"
        return (
          <div key={`${item.group}:${item.id}`}>
            {heading && (
              <div className="flex items-center gap-1.5 px-2 pt-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {heading === "Suggested" && (
                  <Plus className="size-3 text-primary" />
                )}
                {heading}
              </div>
            )}
            <button
              type="button"
              id={`palette-${i}`}
              role="option"
              aria-selected={on}
              data-index={i}
              onMouseMove={() => !on && setActive(i)}
              onClick={() => go(item)}
              className={cn(
                "relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                on && "bg-primary/10 text-primary"
              )}
            >
              {on && (
                <span
                  aria-hidden
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
                />
              )}
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
                  on
                    ? "bg-primary text-primary-foreground"
                    : doing
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="size-3.5" />
              </span>
              <span
                className={cn("min-w-0 flex-1 truncate", on && "font-medium")}
              >
                {item.label}
              </span>
              {item.hint && (
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    on ? "text-primary/80" : "text-muted-foreground"
                  )}
                >
                  {item.hint}
                </span>
              )}
              {on ? (
                <CornerDownLeft className="size-3.5 shrink-0" />
              ) : (
                <ArrowRight className="size-3.5 shrink-0 text-transparent" />
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border bg-background px-1 font-sans text-[10px]">
      {children}
    </kbd>
  )
}
