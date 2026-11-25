import { Check, Copy } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import type { PublicInvoice } from "@/lib/api"
import { partyLines } from "@/lib/invoice"
import { cn } from "cn"
import { copyText } from "@/lib/work"

/** React/UI entry: `Party`. */
export function Party({
	label,
	party,
}: {
	label: string
	party: PublicInvoice["client"]
}) {
	return (
		<div className="grid content-start gap-0.5 text-sm">
			<span className="mb-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{label}
			</span>
			<span className="font-medium">{party.name || "—"}</span>
			{partyLines(party).map((line, index) => (
				<span key={index} className="break-words text-muted-foreground">
					{line}
				</span>
			))}
		</div>
	)
}

/** React/UI entry: `Total`. */
export function Total({
	label,
	value,
	strong,
}: {
	label: string
	value: string
	strong?: boolean
}) {
	return (
		<div
			className={cn(
				"flex justify-between gap-4",
				strong
					? "border-t pt-1.5 text-base font-semibold"
					: "text-muted-foreground"
			)}
		>
			<span>{label}</span>
			<span className={cn("tabular-nums", !strong && "text-foreground")}>
				{value}
			</span>
		</div>
	)
}

/** React/UI entry: `TextBlock`. */
export function TextBlock({ label, text }: { label: string; text: string }) {
	return (
		<div className="grid gap-1">
			<span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{label}
			</span>
			<p className="whitespace-pre-wrap">{text}</p>
		</div>
	)
}

/** React/UI entry: `CopyButton`. */
export function CopyButton({ value, what }: { value: string; what: string }) {
	const [done, setDone] = useState(false)
	return (
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label={`Copy ${what}`}
			onClick={async () => {
				if (!(await copyText(value))) {
					return toast.error("Couldn’t copy to the clipboard")
				}
				setDone(true)
				toast.success(`${what} copied`)
				setTimeout(() => setDone(false), 1500)
			}}
		>
			{done ? <Check /> : <Copy />}
		</Button>
	)
}
