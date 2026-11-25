import { DatePicker } from "@/components/common/date-picker"
import { Loader2 } from "lucide-react"
import { CurrencySelect } from "@/components/common/currency-select"
import { GoalIcon } from "@/components/goals/goal-bits"
import {
	GoalColorPicker,
	GoalIconPicker,
} from "@/components/goals/goal-dialog-appearance"
import { decimalInput, useGoalForm } from "@/components/goals/goal-form"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Goal, GoalInput, GoalKind } from "@/lib/api"
import { isoDate } from "@/lib/format"
import { cn } from "cn"

/** Goal dialog. */
export function GoalDialog({
	open,
	goal,
	preset,
	onClose,
}: {
	open: boolean
	goal?: Goal | null
	preset?: Partial<GoalInput> | null
	onClose: () => void
}) {
	const { form, set, valid, saving, save, editing } = useGoalForm(
		open,
		goal,
		preset,
		onClose
	)
	const payoff = form.kind === "payoff"

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{editing ? "Edit goal" : "New goal"}
					</DialogTitle>
					<DialogDescription>
						Saving up for something, or paying something off? Set a
						target and chip away at it.
					</DialogDescription>
				</DialogHeader>

				<form
					className="grid gap-4"
					onSubmit={(event) => void save(event)}
				>
					<ToggleGroup
						value={[form.kind]}
						onValueChange={(values) =>
							values[0] && set({ kind: values[0] as GoalKind })
						}
						variant="outline"
						className="w-full"
					>
						<ToggleGroupItem value="save" className="flex-1">
							Save up
						</ToggleGroupItem>
						<ToggleGroupItem value="payoff" className="flex-1">
							Pay off
						</ToggleGroupItem>
					</ToggleGroup>

					<div className="flex items-end gap-3">
						<GoalIcon
							goal={{ icon: form.icon, color: form.color }}
							className="size-9"
						/>
						<div className="grid min-w-0 flex-1 gap-2">
							<Label htmlFor="goal-name">Name</Label>
							<Input
								id="goal-name"
								value={form.name}
								maxLength={80}
								onChange={(event) =>
									set({ name: event.target.value })
								}
								placeholder={
									payoff ? "Visa balance" : "Trip to Japan"
								}
								required
								autoFocus
							/>
						</div>
					</div>

					<div
						className={cn(
							"grid gap-3",
							editing
								? "grid-cols-[minmax(0,1fr)_6.5rem]"
								: "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem]"
						)}
					>
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="goal-target">
								{payoff ? "Amount owed" : "Target"}
							</Label>
							<Input
								id="goal-target"
								inputMode="decimal"
								value={form.target}
								onChange={(event) =>
									set({
										target: decimalInput(
											event.target.value
										),
									})
								}
								placeholder="3000"
								required
							/>
						</div>
						{!editing && (
							<div className="grid min-w-0 gap-2">
								<Label htmlFor="goal-start">
									{payoff ? "Already paid" : "Already saved"}
								</Label>
								<Input
									id="goal-start"
									inputMode="decimal"
									value={form.starting}
									onChange={(event) =>
										set({
											starting: decimalInput(
												event.target.value
											),
										})
									}
									placeholder="0"
								/>
							</div>
						)}
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="goal-currency">Currency</Label>
							<CurrencySelect
								id="goal-currency"
								value={form.currency}
								onChange={(currency) => set({ currency })}
							/>
						</div>
					</div>

					<div className="grid min-w-0 gap-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="goal-date">Target date</Label>
							<button
								type="button"
								className="text-xs font-medium text-primary hover:underline"
								onClick={() => set({ hasDate: !form.hasDate })}
							>
								{form.hasDate
									? "No deadline"
									: "Add a deadline"}
							</button>
						</div>
						{form.hasDate ? (
							<DatePicker
								id="goal-date"
								value={form.date}
								min={isoDate()}
								onChange={(date) => set({ date })}
							/>
						) : (
							<p className="text-xs text-muted-foreground">
								A deadline lets Ledger tell you how much to put
								aside each week or month.
							</p>
						)}
					</div>

					<GoalIconPicker
						icon={form.icon}
						onIcon={(icon) => set({ icon })}
					/>
					<GoalColorPicker
						color={form.color}
						onColor={(color) => set({ color })}
					/>

					<div className="grid min-w-0 gap-2">
						<Label htmlFor="goal-notes">Why it matters</Label>
						<Textarea
							id="goal-notes"
							value={form.notes}
							maxLength={500}
							onChange={(event) =>
								set({ notes: event.target.value })
							}
							placeholder="Two weeks in Kyoto with Sam, spring 2027"
						/>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!valid || saving}>
							{saving && <Loader2 className="animate-spin" />}
							{editing ? "Save" : "Create goal"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
