import { TRANSACTIONS_PER_PAGE_OPTIONS } from "@/components/transactions/use-pagination"
import { paginationRange } from "@/components/transactions/pagination-range"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react"
import { useState } from "react"

interface Props {
	page: number
	totalPages: number
	totalCount: number
	perPage: number
	onPageChange: (page: number) => void
	onPerPageChange: (perPage: number) => void
}

function formatShowingRange(
	page: number,
	perPage: number,
	totalCount: number
): string {
	if (totalCount === 0) {
		return "No entries"
	}
	const start = (page - 1) * perPage + 1
	const end = Math.min(page * perPage, totalCount)
	return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${totalCount.toLocaleString()}`
}

function EllipsisJump({
	totalPages,
	onPageChange,
}: {
	totalPages: number
	onPageChange: (page: number) => void
}) {
	const [open, setOpen] = useState(false)
	const [value, setValue] = useState("")

	const submit = () => {
		const parsed = Number.parseInt(value, 10)
		if (Number.isNaN(parsed)) {
			return
		}
		const clamped = Math.max(1, Math.min(parsed, totalPages))
		onPageChange(clamped)
		setOpen(false)
		setValue("")
	}

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next)
				if (!next) {
					setValue("")
				}
			}}
		>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-8"
						aria-label="Jump to page"
					>
						<span aria-hidden>…</span>
					</Button>
				}
			/>
			<PopoverContent className="w-auto p-3" align="center">
				<form
					className="flex items-center gap-2"
					onSubmit={(event) => {
						event.preventDefault()
						submit()
					}}
				>
					<Input
						type="number"
						min={1}
						max={totalPages}
						value={value}
						aria-label={`Page number, 1 to ${totalPages}`}
						className="w-20 tabular-nums"
						onChange={(event) => setValue(event.target.value)}
					/>
					<Button type="submit" size="sm">
						Go
					</Button>
				</form>
			</PopoverContent>
		</Popover>
	)
}

/** Range label, numbered pages, and rows-per-page for transaction tables. */
export function TransactionsPagination({
	page,
	totalPages,
	totalCount,
	perPage,
	onPageChange,
	onPerPageChange,
}: Props) {
	const range = paginationRange(page, totalPages)
	const showPageControls = totalPages > 1

	return (
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t px-4 py-3">
			<p className="text-sm text-muted-foreground tabular-nums">
				{formatShowingRange(page, perPage, totalCount)}
			</p>

			{showPageControls ? (
				<nav
					className="flex flex-wrap items-center justify-center gap-0.5"
					aria-label="Pagination"
				>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={page <= 1}
						aria-label="First page"
						onClick={() => onPageChange(1)}
					>
						<ChevronsLeft />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={page <= 1}
						aria-label="Previous page"
						onClick={() => onPageChange(page - 1)}
					>
						<ChevronLeft />
					</Button>

					{range.map((item) =>
						item.kind === "ellipsis" ? (
							<EllipsisJump
								key={item.key}
								totalPages={totalPages}
								onPageChange={onPageChange}
							/>
						) : (
							<Button
								key={item.page}
								type="button"
								variant={item.page === page ? "default" : "outline"}
								size="icon"
								className="size-8 tabular-nums"
								aria-label={`Page ${item.page}`}
								aria-current={
									item.page === page ? "page" : undefined
								}
								onClick={() => onPageChange(item.page)}
							>
								{item.page}
							</Button>
						)
					)}

					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={page >= totalPages}
						aria-label="Next page"
						onClick={() => onPageChange(page + 1)}
					>
						<ChevronRight />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8"
						disabled={page >= totalPages}
						aria-label="Last page"
						onClick={() => onPageChange(totalPages)}
					>
						<ChevronsRight />
					</Button>
				</nav>
			) : null}

			<div className="flex items-center gap-2 text-sm">
				<span className="text-muted-foreground">Rows per page</span>
				<Select
					value={String(perPage)}
					onValueChange={(next) => {
						if (next) {
							onPerPageChange(Number(next))
						}
					}}
				>
					<SelectTrigger className="w-[5.5rem]" aria-label="Rows per page">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TRANSACTIONS_PER_PAGE_OPTIONS.map((option) => (
							<SelectItem key={option} value={String(option)}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	)
}