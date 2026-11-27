import {
	Card,
	CardAction,
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
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatMoney } from "@/lib/format"
import { quarters, type TaxReport } from "@/lib/tax-report"
import { cn } from "cn"
import { monthName } from "@/components/taxes/month-name"

/** Per-month or per-quarter money in/out table with totals. */
export function TaxPeriodCard({
	loading,
	report,
	home,
	view,
	onViewChange,
}: {
	loading: boolean
	report: TaxReport
	home: string
	view: "months" | "quarters"
	onViewChange: (view: "months" | "quarters") => void
}) {
	return (
		<Card className="gap-0 pb-0 lg:col-span-2">
			<CardHeader className="pb-4">
				<CardTitle>Over the Year</CardTitle>
				<CardDescription>
					Quarters line up with estimated tax instalments
				</CardDescription>
				<CardAction className="print:hidden">
					<Tabs
						value={view}
						onValueChange={(viewValue) =>
							onViewChange(viewValue as typeof view)
						}
					>
						<TabsList>
							<TabsTrigger value="months">Months</TabsTrigger>
							<TabsTrigger value="quarters">Quarters</TabsTrigger>
						</TabsList>
					</Tabs>
				</CardAction>
			</CardHeader>
			<CardContent className="px-0">
				{loading ? (
					<Skeleton className="mx-4 mb-4 h-64" />
				) : report.byMonth.length === 0 ? (
					<p className="px-4 py-12 text-center text-sm text-muted-foreground">
						Nothing yet.
					</p>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="pl-4">
										{view === "months"
											? "Month"
											: "Quarter"}
									</TableHead>
									<TableHead className="text-right">
										In
									</TableHead>
									<TableHead className="text-right">
										Out
									</TableHead>
									<TableHead className="pr-4 text-right">
										Net
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{(view === "months"
									? report.byMonth.map((month) => ({
											key: month.month,
											label: monthName(month.month),
											...month,
										}))
									: quarters(report.byMonth).map(
											(quarter) => ({
												key: quarter.quarter,
												label: quarter.quarter.slice(5),
												...quarter,
											})
										)
								).map((row) => {
									const net = row.moneyIn - row.moneyOut
									return (
										<TableRow key={row.key}>
											<TableCell className="pl-4 font-medium">
												{row.label}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{formatMoney(row.moneyIn, home)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{formatMoney(
													row.moneyOut,
													home
												)}
											</TableCell>
											<TableCell
												className={cn(
													"pr-4 text-right tabular-nums",
													net < 0
														? "text-destructive"
														: "text-emerald-600 dark:text-emerald-400"
												)}
											>
												{formatMoney(net, home, {
													sign: true,
												})}
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
							<TableFooter>
								<TableRow>
									<TableCell className="pl-4">
										Total
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(
											report.byMonth.reduce(
												(total, month) =>
													total + month.moneyIn,
												0
											),
											home
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatMoney(
											report.byMonth.reduce(
												(total, month) =>
													total + month.moneyOut,
												0
											),
											home
										)}
									</TableCell>
									<TableCell className="pr-4 text-right tabular-nums">
										{formatMoney(
											report.byMonth.reduce(
												(total, month) =>
													total +
													month.moneyIn -
													month.moneyOut,
												0
											),
											home,
											{ sign: true }
										)}
									</TableCell>
								</TableRow>
							</TableFooter>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
