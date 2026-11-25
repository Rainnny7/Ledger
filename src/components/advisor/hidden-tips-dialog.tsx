import { TipIcon } from "@/components/advisor/advisor-bits"
import { KIND_META } from "@/components/advisor/advisor-meta"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import type { Tip } from "@/lib/advisor"
import { BellOff, EyeOff } from "lucide-react"
import { useEffect } from "react"

/** "Snoozed until Dec 25" or "Hidden". */
function hiddenLabel(until: string | null) {
	if (!until) {
		return "Hidden"
	}
	const untilDate = new Date(until)
	if (Number.isNaN(untilDate.getTime())) {
		return "Snoozed"
	}
	return `Snoozed until ${untilDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
}

/** Every tip that's hidden or snoozed, so each can be brought back on its own (or all at once). */
export function HiddenTipsDialog({
	items,
	open,
	onOpenChange,
	onRestore,
}: {
	items: { tip: Tip; until: string | null }[]
	open: boolean
	onOpenChange: (open: boolean) => void
	onRestore: (id?: string) => Promise<void>
}) {
	// Nothing left to show: close rather than sit on an empty list.
	useEffect(() => {
		if (open && items.length === 0) {
			onOpenChange(false)
		}
	}, [open, items.length, onOpenChange])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Hidden tips</DialogTitle>
					<DialogDescription>
						Snoozed tips come back on their own. Restore any of them
						sooner here.
					</DialogDescription>
				</DialogHeader>
				<ul className="grid max-h-[60vh] gap-2 overflow-y-auto">
					{items.map(({ tip, until }) => {
						const meta = KIND_META[tip.kind]
						return (
							<li
								key={tip.id}
								className="flex items-center gap-3 rounded-lg border p-3"
							>
								<TipIcon kind={tip.kind} className="size-8" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{tip.title}
									</p>
									<p className="flex items-center gap-1 text-xs text-muted-foreground">
										{until ? (
											<BellOff className="size-3" />
										) : (
											<EyeOff className="size-3" />
										)}
										{hiddenLabel(until)} · {meta.label}
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onClick={() => void onRestore(tip.id)}
								>
									Restore
								</Button>
							</li>
						)
					})}
				</ul>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Close
					</Button>
					<Button onClick={() => void onRestore()}>
						Restore all
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
