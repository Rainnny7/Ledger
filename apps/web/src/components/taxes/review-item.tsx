import { CircleAlert, CircleCheck, type LucideIcon } from "lucide-react"
import { ArrowRightIcon } from "@/components/icons/arrow-right"
import { type ReactNode, useState } from "react"
import { Link } from "@tanstack/react-router"
import { hrefTarget } from "@/components/common/href-target"
import { TransactionsTable } from "@/components/transactions/transactions-table"
import { Button } from "@/components/ui/button"
import type { Transaction } from "@/lib/api"
import { cn } from "cn"

const PREVIEW = 25

/** One tax-review bucket: its transactions preview with a link to the full list. */
export function ReviewItem({
	icon: Icon,
	title,
	done,
	body,
	items,
	link,
	accounts,
	onSelect,
}: {
	icon: LucideIcon
	title: string
	done: string
	body: ReactNode
	items: Transaction[]
	link?: string
	accounts: Parameters<typeof TransactionsTable>[0]["accounts"]
	onSelect: (transaction: Transaction) => void
}) {
	const [open, setOpen] = useState(false)
	if (items.length === 0) {
		return (
			<div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground">
				<CircleCheck className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
				{done}
			</div>
		)
	}
	return (
		<div
			className={cn(
				"overflow-hidden rounded-lg border",
				open && "border-primary/30"
			)}
		>
			<div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
				<span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
					<Icon className="size-4" />
					<CircleAlert className="absolute -top-1 -right-1 size-3.5 fill-background text-amber-500" />
				</span>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">
						{title}{" "}
						<span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary tabular-nums">
							{items.length}
						</span>
					</p>
					<p className="text-xs text-muted-foreground">{body}</p>
				</div>
				<div className="flex gap-1">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setOpen((isOpen) => !isOpen)}
						aria-expanded={open}
					>
						{open ? "Hide" : "Review"}
					</Button>
					{link && (
						<Button
							variant="ghost"
							size="sm"
							render={<Link {...hrefTarget(link)} />}
							nativeButton={false}
						>
							Transactions{" "}
							<ArrowRightIcon size={24} className="flex" />
						</Button>
					)}
				</div>
			</div>
			{open && (
				<div className="border-t">
					<TransactionsTable
						transactions={items.slice(0, PREVIEW)}
						accounts={accounts}
						onSelect={onSelect}
						showAccount={accounts.length > 1}
					/>
					{items.length > PREVIEW && link && (
						<p className="border-t p-2 text-center text-xs text-muted-foreground">
							Showing {PREVIEW} of {items.length}.{" "}
							<Link
								{...hrefTarget(link)}
								className="font-medium text-primary underline-offset-4 hover:underline"
							>
								See them all
							</Link>
						</p>
					)}
				</div>
			)}
		</div>
	)
}
