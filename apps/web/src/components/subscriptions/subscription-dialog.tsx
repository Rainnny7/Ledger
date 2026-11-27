import { DatePicker } from "@/components/common/date-picker"
import { Loader2 } from "lucide-react"
import { CurrencySelect } from "@/components/common/currency-select"
import { SubscriptionCategoryField } from "@/components/subscriptions/subscription-category-field"
import {
	SUBSCRIPTION_CUSTOM_CYCLE,
	subscriptionCycleItems,
	subscriptionUnitItems,
	type SubscriptionDraft,
	useSubscriptionForm,
} from "@/components/subscriptions/subscription-form"
import { SubscriptionPaidFrom } from "@/components/subscriptions/subscription-paid-from"
import { SubscriptionPaymentHistory } from "@/components/subscriptions/subscription-payment-history"
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { Account, Cycle, CycleUnit, Subscription } from "@/lib/api"

interface Props {
	draft: SubscriptionDraft | null
	existing?: Subscription | null
	accounts: Account[]
	onClose: () => void
	onSaved?: () => void
}

/**
 * Create/edit dialog for a recurring subscription; edits shared by others are limited to
 * non-owner fields.
 */
export function SubscriptionDialog({
	draft,
	existing,
	accounts,
	onClose,
	onSaved,
}: Props) {
	const {
		form,
		set,
		saving,
		save,
		valid,
		editing,
		theirs,
		unitMax,
		customValid,
		decimalInput,
	} = useSubscriptionForm(draft, existing, accounts, onClose, onSaved)

	return (
		<Dialog open={!!draft} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent className="max-h-[90svh] overflow-x-hidden overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{editing ? "Edit Subscription" : "Track a Subscription"}
					</DialogTitle>
					<DialogDescription>
						{draft?.merchantKey
							? "Payments from your accounts that match this merchant are linked automatically."
							: "Add any recurring payment — streaming, phone, gym, rent."}
					</DialogDescription>
				</DialogHeader>

				<form
					className="grid gap-4"
					onSubmit={(event) => void save(event)}
				>
					<div className="grid min-w-0 gap-2">
						<Label htmlFor="sub-name">Name</Label>
						<Input
							id="sub-name"
							value={form.name}
							onChange={(event) =>
								set({ name: event.target.value })
							}
							placeholder="Netflix"
							required
							autoFocus
						/>
					</div>
					<div className="grid grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] gap-3">
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="sub-amount">Amount</Label>
							<Input
								id="sub-amount"
								inputMode="decimal"
								value={form.amount}
								onChange={(event) =>
									set({
										amount: decimalInput(
											event.target.value
										),
									})
								}
								placeholder="18.99"
								required
							/>
						</div>
						<div className="grid min-w-0 gap-2">
							<Label htmlFor="sub-currency">Currency</Label>
							<CurrencySelect
								id="sub-currency"
								value={form.currency}
								onChange={(currency) => set({ currency })}
							/>
						</div>
						<div className="grid min-w-0 gap-2">
							<Label>Billed</Label>
							<Select
								items={subscriptionCycleItems}
								value={
									form.custom
										? SUBSCRIPTION_CUSTOM_CYCLE
										: form.cycle
								}
								onValueChange={(cycleValue) => {
									if (!cycleValue) {
										return
									}
									if (
										cycleValue === SUBSCRIPTION_CUSTOM_CYCLE
									) {
										set({ custom: true })
									} else {
										set({
											custom: false,
											cycle: cycleValue as Cycle,
										})
									}
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{subscriptionCycleItems.map(
										(cycleOption) => (
											<SelectItem
												key={cycleOption.value}
												value={cycleOption.value}
											>
												{cycleOption.label}
											</SelectItem>
										)
									)}
								</SelectContent>
							</Select>
						</div>
					</div>
					{form.custom && (
						<div className="grid min-w-0 animate-in gap-2 duration-200 fade-in-0 slide-in-from-top-1">
							<Label htmlFor="sub-every">Repeats every</Label>
							<div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
								<Input
									id="sub-every"
									inputMode="numeric"
									value={form.every}
									onChange={(event) =>
										set({
											every: event.target.value
												.replace(/\D/g, "")
												.slice(0, 3),
										})
									}
									aria-invalid={!customValid}
								/>
								<Select
									items={subscriptionUnitItems}
									value={form.unit}
									onValueChange={(unitValue) =>
										unitValue &&
										set({ unit: unitValue as CycleUnit })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{subscriptionUnitItems.map(
											(unitOption) => (
												<SelectItem
													key={unitOption.value}
													value={unitOption.value}
												>
													{unitOption.label}
												</SelectItem>
											)
										)}
									</SelectContent>
								</Select>
							</div>
							{!customValid && (
								<p className="text-xs text-destructive">
									Enter a whole number from 1 to {unitMax}.
								</p>
							)}
						</div>
					)}
					<div className="grid min-w-0 gap-2">
						<Label htmlFor="sub-date">Billing date</Label>
						<DatePicker
							id="sub-date"
							value={form.date}
							onChange={(date) => set({ date })}
						/>
						<p className="text-xs text-muted-foreground">
							Any past or upcoming charge date — the next one is
							worked out for you.
						</p>
					</div>
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
						<SubscriptionCategoryField
							category={form.category}
							onCategory={(category) => set({ category })}
						/>
						<SubscriptionPaidFrom
							theirs={theirs}
							existing={existing}
							form={form}
							accounts={accounts}
							onAccount={(accountId, currency) => {
								set({
									accountId,
									...(currency ? { currency } : {}),
								})
							}}
						/>
					</div>
					<div className="grid min-w-0 gap-2">
						<Label htmlFor="sub-notes">Notes</Label>
						<Textarea
							id="sub-notes"
							value={form.notes}
							maxLength={500}
							onChange={(event) =>
								set({ notes: event.target.value })
							}
							placeholder="Shared family plan, cancel before renewal…"
						/>
					</div>

					{existing && (
						<SubscriptionPaymentHistory existing={existing} />
					)}

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
							{editing ? "Save" : "Track subscription"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
