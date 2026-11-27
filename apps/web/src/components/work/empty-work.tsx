import { Briefcase, Clock, ReceiptText } from "lucide-react"
import { CalendarClockIcon } from "@/components/icons/calendar-clock"
import { PlusIcon } from "@/components/icons/plus"
import { SlotIcon } from "@/components/icons/slot-icon"
import { useAnimatedIcon } from "@/components/icons/use-animated-icon"
import { tintStyle } from "@/components/goals/goal-meta"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/** React/UI entry: `EmptyWork`. */
export function EmptyWork({ onAdd }: { onAdd: () => void }) {
	const { ref: addIconRef, handlers: addIconHandlers } =
		useAnimatedIcon<HTMLButtonElement>()
	const steps = [
		{
			icon: Clock,
			title: "Log Hours",
			body: "Add shifts as you go, or just your tracker total.",
		},
		{
			icon: ReceiptText,
			title: "Bill Them",
			body: "“done 40 hours since last pay, total is $1,000.”",
		},
		{
			icon: CalendarClockIcon,
			title: "Get Paid in Instalments",
			body: "Record each payment and see when it’s cleared.",
		},
	]
	return (
		<Card className="items-center py-12 text-center">
			<CardContent className="flex flex-col items-center gap-5">
				<span
					className="grid size-14 place-items-center rounded-2xl"
					style={tintStyle("ocean")}
				>
					<Briefcase className="size-7" />
				</span>
				<div>
					<h2 className="font-semibold">Track a Side Job</h2>
					<p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
						For hourly work you bill yourself. Keep the running
						total of what you’re owed in one place instead of a chat
						thread.
					</p>
				</div>
				<div className="grid w-full max-w-2xl gap-2 sm:grid-cols-3">
					{steps.map(({ icon: Icon, title, body }) => (
						<div
							key={title}
							className="rounded-xl border p-3 text-left"
						>
							<SlotIcon
								icon={Icon}
								size={16}
								className="mb-2 text-primary"
							/>
							<p className="text-sm font-medium">{title}</p>
							<p className="text-xs text-muted-foreground">
								{body}
							</p>
						</div>
					))}
				</div>
				<Button onClick={onAdd} {...addIconHandlers}>
					<PlusIcon ref={addIconRef} size={24} className="flex" /> Add
					a job
				</Button>
			</CardContent>
		</Card>
	)
}
