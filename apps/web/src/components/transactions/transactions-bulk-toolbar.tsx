import { BriefcaseBusiness, Loader2, Tags } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	transactionRecategorizeItems,
	transactionRetagItems,
} from "@/components/transactions/transactions-filter-items"

/** React/UI entry: `TransactionsBulkToolbar`. */
export function TransactionsBulkToolbar({
	shownCount,
	filteredCount,
	allShownPicked,
	pickedCount,
	applying,
	onToggleAll,
	onRecategorize,
	onRetag,
}: {
	shownCount: number
	filteredCount: number
	allShownPicked: boolean
	pickedCount: number
	applying: boolean
	onToggleAll: () => void
	onRecategorize: (value: string) => void
	onRetag: (value: string) => void
}) {
	if (shownCount === 0) {
		return null
	}
	return (
		<div className="flex min-h-8 flex-wrap items-center gap-2 text-sm">
			<Button variant="ghost" size="sm" onClick={onToggleAll}>
				{allShownPicked
					? "Select none"
					: `Select ${shownCount === filteredCount ? "all" : `these ${shownCount}`}`}
			</Button>
			{pickedCount > 0 && (
				<>
					<span className="text-muted-foreground">
						{pickedCount} selected
					</span>
					<Select
						items={transactionRecategorizeItems}
						value={null}
						onValueChange={(next) =>
							next && onRecategorize(next as string)
						}
					>
						<SelectTrigger
							size="sm"
							className="min-w-0 w-full max-w-48"
							disabled={applying}
						>
							{applying ? (
								<Loader2 className="animate-spin" />
							) : (
								<Tags />
							)}
							<SelectValue placeholder="Change category…" />
						</SelectTrigger>
						<SelectContent>
							{transactionRecategorizeItems.map((category) => (
								<SelectItem
									key={category.value}
									value={category.value}
								>
									{category.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						items={transactionRetagItems}
						value={null}
						onValueChange={(next) =>
							next && onRetag(next as string)
						}
					>
						<SelectTrigger
							size="sm"
							className="min-w-0 w-full max-w-44"
							disabled={applying}
						>
							<BriefcaseBusiness />
							<SelectValue placeholder="Tag for taxes…" />
						</SelectTrigger>
						<SelectContent>
							{transactionRetagItems.map((category) => (
								<SelectItem
									key={category.value}
									value={category.value}
								>
									{category.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</>
			)}
		</div>
	)
}
