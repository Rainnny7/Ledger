import { Printer } from "lucide-react"
import { DownloadIcon } from "@/components/icons/download"
import { Link } from "@tanstack/react-router"
import { hrefTarget } from "@/components/common/href-target"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { TaxReport } from "@/lib/tax-report"
import { formatShortDate } from "@/lib/format"
import {
	StatementColumn,
	StatementRow,
} from "@/components/taxes/statement-bits"

/** Business income, expenses and net for the selected period. */
export function TaxSummaryCard({
	year,
	from,
	to,
	loading,
	report,
	mixed,
	home,
	accountCount,
	businessNet,
	untouched,
	hasTransactions,
	transactionsLink,
	onDownloadCsv,
	onDownloadPackage,
}: {
	year: number
	from: string
	to: string
	loading: boolean
	report: TaxReport
	mixed: boolean
	home: string
	accountCount: number
	businessNet: number
	untouched: boolean
	hasTransactions: boolean
	transactionsLink: string
	onDownloadCsv: () => void
	onDownloadPackage: () => void
}) {
	return (
		<Card className="gap-0 py-0">
			<div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
				<div>
					<h2 className="text-lg font-semibold tracking-tight">
						{year} tax report
					</h2>
					<p className="text-sm text-muted-foreground">
						{loading
							? " "
							: `${formatShortDate(from)} – ${formatShortDate(to)} · ${report.count.toLocaleString()} transactions · ${accountCount} account${accountCount === 1 ? "" : "s"}${mixed ? ` · in ${home} at today’s rates` : ""}`}
					</p>
				</div>
				<div className="flex flex-wrap gap-2 print:hidden">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => window.print()}
						disabled={loading}
					>
						<Printer /> Print
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={onDownloadCsv}
						disabled={loading || !hasTransactions}
					>
						<DownloadIcon size={24} className="flex" /> CSV
					</Button>
				</div>
			</div>

			<div className="grid gap-6 border-t px-5 py-4 md:grid-cols-2 md:gap-10">
				<StatementColumn title="Everything">
					<StatementRow
						label="Money in"
						hint="Pay and other income"
						value={report.income}
						loading={loading}
					/>
					<StatementRow
						label="Money out"
						hint="After refunds, not counting transfers"
						value={report.spending}
						loading={loading}
					/>
				</StatementColumn>
				<StatementColumn title="Business">
					<StatementRow
						label="Income"
						value={report.businessIn}
						loading={loading}
					/>
					<StatementRow
						label="Expenses"
						value={report.businessOut}
						loading={loading}
					/>
					<StatementRow
						label="Net"
						value={businessNet}
						loading={loading}
						total
						sign
						negative={businessNet < 0}
					/>
					{!loading && untouched && hasTransactions && (
						<p className="pt-2 text-xs text-muted-foreground print:hidden">
							Nothing’s tagged as business yet. Select
							transactions on{" "}
							<Link
								{...hrefTarget(transactionsLink)}
								className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
							>
								Transactions
							</Link>{" "}
							and choose{" "}
							<span className="font-medium">Tag for taxes</span>{" "}
							to total them here.
						</p>
					)}
				</StatementColumn>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3 print:hidden">
				<p className="min-w-0 text-sm text-muted-foreground">
					<span className="font-medium text-foreground">
						For your accountant:
					</span>{" "}
					the summary, monthly and quarterly totals, business lines
					and every transaction, as CSVs in one .zip.
				</p>
				<Button
					onClick={onDownloadPackage}
					disabled={loading || !hasTransactions}
				>
					<DownloadIcon size={24} className="flex" /> Download package
				</Button>
			</div>
		</Card>
	)
}
