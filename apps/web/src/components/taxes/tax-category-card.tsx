import { BriefcaseBusiness } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { hrefTarget } from "@/components/common/href-target"
import { CategoryIcon } from "@/components/transactions/tx-bits"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { CATEGORY_META } from "@/lib/categories"
import { formatMoney } from "@/lib/format"
import type { TaxReport } from "@/lib/tax-report"
import { cn } from "cn"

/** Business spending by category, each linking to the matching transactions. */
export function TaxCategoryCard({
	year,
	loading,
	report,
	home,
	txLink,
}: {
	year: number
	loading: boolean
	report: TaxReport
	home: string
	txLink: (extra: Record<string, string>) => string
}) {
	return (
		<Card className="gap-0 pb-0 lg:col-span-3">
			<CardHeader className="pb-4">
				<CardTitle>By Category</CardTitle>
				<CardDescription>
					Transfers between your own accounts are left out. Click a
					row to see its transactions.
				</CardDescription>
			</CardHeader>
			<CardContent className="px-0">
				{loading ? (
					<Skeleton className="mx-4 mb-4 h-64" />
				) : report.byCategory.length === 0 ? (
					<p className="px-4 py-12 text-center text-sm text-muted-foreground">
						No transactions in {year}.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="pl-4">Category</TableHead>
								<TableHead className="text-right">In</TableHead>
								<TableHead className="text-right">
									Out
								</TableHead>
								<TableHead className="pr-4 text-right">
									<span className="inline-flex items-center gap-1 text-primary">
										<BriefcaseBusiness className="size-3.5" />{" "}
										Business
									</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{report.byCategory.map((line) => {
								const business =
									line.businessOut || line.businessIn
								return (
									<TableRow
										key={line.category}
										className="cursor-pointer"
									>
										<TableCell className="pl-4">
											<Link
												{...hrefTarget(
													txLink({
														category: line.category,
													})
												)}
												className="flex items-center gap-2.5"
											>
												<CategoryIcon
													category={line.category}
													className="print:hidden"
												/>
												<span className="min-w-0">
													<span className="block truncate font-medium">
														{
															CATEGORY_META[
																line.category
															].label
														}
													</span>
													<span className="block text-xs text-muted-foreground">
														{line.count} transaction
														{line.count === 1
															? ""
															: "s"}
													</span>
												</span>
											</Link>
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{line.moneyIn
												? formatMoney(
														line.moneyIn,
														home
													)
												: "—"}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{line.moneyOut
												? formatMoney(
														line.moneyOut,
														home
													)
												: "—"}
										</TableCell>
										<TableCell
											className={cn(
												"pr-4 text-right tabular-nums",
												business
													? "font-medium text-primary"
													: "text-muted-foreground"
											)}
										>
											{business
												? formatMoney(
														line.businessOut ||
															line.businessIn,
														home
													)
												: "—"}
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	)
}
