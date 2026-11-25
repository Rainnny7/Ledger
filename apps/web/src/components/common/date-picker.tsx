import { CalendarDays, X } from "lucide-react"
import { useState } from "react"
import type { Matcher } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { formatDate, isoDate, parseIso } from "@/lib/format"
import { cn } from "cn"

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * A date field that opens the app's own calendar instead of the browser's date picker. Takes and
 * gives "YYYY-MM-DD" strings, like `<input type="date">` did ('' for none).
 */
export function DatePicker({
	id,
	value,
	onChange,
	min,
	max,
	placeholder = "Pick a date",
	clearable,
	className,
	"aria-label": ariaLabel,
}: {
	id?: string
	value: string
	onChange: (iso: string) => void
	min?: string
	max?: string
	placeholder?: string
	/** Shows an × that empties the field. */
	clearable?: boolean
	className?: string
	"aria-label"?: string
}) {
	const [open, setOpen] = useState(false)
	const selected = ISO.test(value) ? parseIso(value) : undefined
	const disabled: Matcher[] = []
	if (min && ISO.test(min)) {
		disabled.push({ before: parseIso(min) })
	}
	if (max && ISO.test(max)) {
		disabled.push({ after: parseIso(max) })
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<div className={cn("relative", className)}>
				<PopoverTrigger
					render={
						<Button
							id={id}
							type="button"
							variant="outline"
							aria-label={ariaLabel}
							className={cn(
								"w-full justify-start px-2.5 font-normal tabular-nums",
								!selected && "text-muted-foreground",
								clearable && selected && "pr-8"
							)}
						/>
					}
				>
					<CalendarDays className="text-muted-foreground" />
					<span className="truncate">
						{selected ? formatDate(value) : placeholder}
					</span>
				</PopoverTrigger>
				{clearable && selected && (
					<button
						type="button"
						aria-label="Clear date"
						onClick={() => onChange("")}
						className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<X className="size-3.5" />
					</button>
				)}
			</div>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={selected}
					defaultMonth={
						selected ??
						(max && ISO.test(max) ? parseIso(max) : undefined)
					}
					disabled={disabled}
					onSelect={(pickedDate) => {
						if (!pickedDate) {
							return
						}
						onChange(isoDate(pickedDate))
						setOpen(false)
					}}
					autoFocus
				/>
			</PopoverContent>
		</Popover>
	)
}
