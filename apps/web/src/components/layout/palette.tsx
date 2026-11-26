import { Clock, CornerDownLeft } from "lucide-react"
import type { PaletteItem } from "@/components/layout/command-palette-data"
import { PlusIcon } from "@/components/icons/plus"
import { SearchIcon } from "@/components/icons/search"
import { ArrowRightIcon } from "@/components/icons/arrow-right"
import { SlotIcon } from "@/components/icons/slot-icon"
import { useAnimatedIcon } from "@/components/icons/use-animated-icon"
import { usePalette } from "@/components/layout/use-palette"
import { cn } from "cn"

/** Full-screen quick search UI (input, results list, footer hints). */
export function Palette({ onDone }: { onDone: () => void }) {
	const { query, setQuery, setActive, listRef, items, current, go } =
		usePalette({ onDone })
	const { ref: searchIconRef, handlers: searchIconHandlers } =
		useAnimatedIcon<HTMLDivElement>()

	return (
		<div className="flex max-h-[min(34rem,70svh)] flex-col">
			<div
				className="flex items-center gap-2.5 border-b px-3.5"
				{...searchIconHandlers}
			>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
					<SearchIcon
						ref={searchIconRef}
						size={16}
						className="flex"
					/>
				</span>
				<input
					autoFocus
					value={query}
					onChange={(event) => {
						setQuery(event.target.value)
						setActive(0)
					}}
					onKeyDown={(event) => {
						if (!items.length) {
							return
						}
						if (event.key === "ArrowDown") {
							event.preventDefault()
							setActive((current + 1) % items.length)
						} else if (event.key === "ArrowUp") {
							event.preventDefault()
							setActive(
								(current - 1 + items.length) % items.length
							)
						} else if (event.key === "Enter") {
							event.preventDefault()
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
					Try <span className="font-medium text-primary">42.50</span>{" "}
					to find a transaction
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
	setActive: (index: number | ((current: number) => number)) => void
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
			{items.map((item, index) => (
				<PaletteOption
					key={`${item.group}:${item.id}`}
					item={item}
					index={index}
					items={items}
					current={current}
					setActive={setActive}
					go={go}
				/>
			))}
		</div>
	)
}

function PaletteOption({
	item,
	index,
	items,
	current,
	setActive,
	go,
}: {
	item: PaletteItem
	index: number
	items: PaletteItem[]
	current: number
	setActive: (index: number | ((current: number) => number)) => void
	go: (item: PaletteItem | undefined) => void
}) {
	const { ref: iconRef, handlers: iconHandlers } =
		useAnimatedIcon<HTMLButtonElement>()
	const heading = item.group !== items[index - 1]?.group ? item.group : null
	const Icon = item.group === "Recent" ? Clock : item.icon
	const on = index === current
	const doing = item.group === "Actions" || item.group === "Suggested"

	return (
		<div>
			{heading && (
				<div className="flex items-center gap-1.5 px-2 pt-2.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
					{heading === "Suggested" && (
						<PlusIcon size={12} className="flex text-primary" />
					)}
					{heading}
				</div>
			)}
			<button
				type="button"
				id={`palette-${index}`}
				role="option"
				aria-selected={on}
				data-index={index}
				onMouseMove={() => !on && setActive(index)}
				onClick={() => go(item)}
				className={cn(
					"relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
					on && "bg-primary/10 text-primary"
				)}
				{...iconHandlers}
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
					<SlotIcon icon={Icon} iconRef={iconRef} size={14} />
				</span>
				<span className="min-w-0 flex-1 truncate">{item.label}</span>
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
					<ArrowRightIcon
						size={14}
						className="flex shrink-0 text-transparent"
					/>
				)}
			</button>
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
