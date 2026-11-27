import { BriefcaseBusiness, Clock, NotebookPen, Tags } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { TransactionSheet } from "@/components/transactions/transaction-sheet"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { QueryError } from "@/components/ui/query-error"
import { Skeleton } from "@/components/ui/skeleton"
import type { Transaction } from "@/lib/api"
import { useSession } from "@/lib/auth-client"
import { inHomeCurrency, useConverter } from "@/lib/currency"
import { DEMO_IDENTITY, demoMode } from "@/lib/demo"
import { formatMoney } from "@/lib/format"
import { useOverview, useTransactions } from "@/lib/queries"
import {
	accountantPackage,
	buildTaxReport,
	defaultReportYear,
	downloadBlob,
	type ExportInput,
	reportYears,
	transactionsCsv,
} from "@/lib/tax-report"
import { useIntent, useUrlState } from "@/lib/url-state"
import { PlainSelect } from "@/components/taxes/plain-select"
import { ReviewItem } from "@/components/taxes/review-item"
import { TaxCategoryCard } from "@/components/taxes/tax-category-card"
import { TaxPeriodCard } from "@/components/taxes/tax-period-card"
import { TaxSummaryCard } from "@/components/taxes/tax-summary-card"

/** A year's money, tidied up and packaged for an accountant. */
export function TaxesPage() {
	const overview = useOverview()
	const txq = useTransactions(null)
	const converter = useConverter()
	const session = useSession().data
	const owner = demoMode ? DEMO_IDENTITY.name : session?.user.name

	const accounts = useMemo(
		() => overview.data?.accounts ?? [],
		[overview.data]
	)
	const transactions = useMemo(() => txq.data?.transactions ?? [], [txq.data])
	const years = useMemo(() => reportYears(transactions), [transactions])
	const [yearParam, setYear] = useUrlState<string>(
		"year",
		String(defaultReportYear(years)),
		years.map(String)
	)
	const [accountId, setAccountId] = useUrlState<string>("account", "all")
	const [selected, setSelected] = useState<Transaction | null>(null)
	const [view, setView] = useState<"months" | "quarters">("months")

	const year = Number(yearParam)
	const from = `${year}-01-01`
	const to = `${year}-12-31`
	const shownAccounts = useMemo(
		() =>
			accountId === "all"
				? accounts
				: accounts.filter((account) => account.id === accountId),
		[accounts, accountId]
	)

	const { original, converted, report, mixed } = useMemo(() => {
		const ids = new Set(shownAccounts.map((account) => account.id))
		const periodTx = transactions.filter(
			(transaction) =>
				ids.has(transaction.accountId) &&
				transaction.date >= from &&
				transaction.date <= to
		)
		const home = inHomeCurrency(shownAccounts, periodTx, converter)
		const homeById = new Map(
			home.transactions.map((transaction) => [
				transaction.id,
				transaction,
			])
		)
		return {
			original: periodTx,
			converted: homeById,
			report: buildTaxReport(home.transactions),
			mixed: home.mixed,
		}
	}, [transactions, shownAccounts, from, to, converter])

	const byId = useMemo(
		() =>
			new Map(
				original.map((transaction) => [transaction.id, transaction])
			),
		[original]
	)
	const back = (list: Transaction[]) =>
		list.map((transaction) => byId.get(transaction.id) ?? transaction)

	const exportInput: ExportInput = {
		label: String(year),
		from,
		to,
		home: converter.home,
		accounts: shownAccounts,
		original,
		converted,
		report,
		owner,
	}
	const suffix =
		accountId === "all"
			? ""
			: `-${(shownAccounts[0]?.name ?? "account").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

	function downloadPackage() {
		downloadBlob(
			`ledger-tax-${year}${suffix}.zip`,
			accountantPackage(exportInput, (value) =>
				formatMoney(value, converter.home)
			)
		)
		toast.success(`Saved the ${year} package`, {
			description:
				"A summary, monthly totals and every transaction, ready to send.",
		})
	}
	function downloadCsv() {
		downloadBlob(
			`transactions-${year}${suffix}.csv`,
			new Blob([transactionsCsv(exportInput)], {
				type: "text/csv;charset=utf-8",
			})
		)
	}

	const txLink = (extra: Record<string, string>) => {
		const params = new URLSearchParams({
			from,
			to,
			...(accountId === "all" ? {} : { account: accountId }),
			...extra,
		})
		return `/transactions?${params}`
	}

	const loading = !txq.data || !overview.data
	useIntent(
		"download",
		() => original.length > 0 && downloadPackage(),
		!loading
	)
	const businessNet = report.businessIn - report.businessOut
	const untouched = report.businessIn === 0 && report.businessOut === 0
	const review = report.review
	const openItems = [
		review.uncategorized,
		review.untaggedIncome,
		review.businessNoNote,
		review.pending,
	].filter((line) => line.length > 0).length

	const yearItems = years.map((calendarYear) => ({
		value: String(calendarYear),
		label:
			calendarYear === new Date().getFullYear()
				? `${calendarYear} (so far)`
				: String(calendarYear),
	}))
	const accountItems = [
		{ value: "all", label: "All Accounts" },
		...accounts.map((account) => ({
			value: account.id,
			label: account.name,
		})),
	]

	return (
		<div className="grid gap-8">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">
						Taxes
					</h1>
					<p className="text-sm text-muted-foreground">
						Get a year ready for your accountant: tag what’s
						business, fix the loose ends, then download it all in
						one go.
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2 print:hidden">
					<PlainSelect
						items={yearItems}
						value={yearParam}
						onChange={setYear}
						className="w-36"
						label="Tax Year"
					/>
					{accounts.length > 1 && (
						<PlainSelect
							items={accountItems}
							value={accountId}
							onChange={setAccountId}
							className="w-44"
							label="Account"
						/>
					)}
				</div>
			</div>

			{txq.error && !txq.data && (
				<QueryError
					message={txq.error.message}
					onRetry={() => void txq.reload()}
				/>
			)}

			<TaxSummaryCard
				year={year}
				from={from}
				to={to}
				loading={loading}
				report={report}
				mixed={mixed}
				home={converter.home}
				accountCount={shownAccounts.length}
				businessNet={businessNet}
				untouched={untouched}
				hasTransactions={original.length > 0}
				transactionsLink={txLink({ flow: "out" })}
				onDownloadCsv={downloadCsv}
				onDownloadPackage={downloadPackage}
			/>

			<Card className="print:hidden">
				<CardHeader>
					<CardTitle>Before You Send It</CardTitle>
					<CardDescription>
						{loading
							? " "
							: openItems === 0
								? "All tidy. Nothing left that an accountant would ask about."
								: `${openItems} thing${openItems === 1 ? "" : "s"} an accountant is likely to ask about`}
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2">
					{loading ? (
						<Skeleton className="h-40" />
					) : (
						<>
							<ReviewItem
								icon={Tags}
								title="Filed under Other"
								done="Every transaction has a category"
								body="Give these a category so they land in the right line of the summary."
								items={back(review.uncategorized)}
								link={txLink({ category: "other" })}
								accounts={accounts}
								onSelect={setSelected}
							/>
							<ReviewItem
								icon={BriefcaseBusiness}
								title="Income that isn’t tagged"
								done="All your income is tagged business or personal"
								body="Is it pay from an employer, money from clients, or a gift? Tag it so your accountant can tell."
								items={back(review.untaggedIncome)}
								link={txLink({
									category: "income",
									tag: "untagged",
								})}
								accounts={accounts}
								onSelect={setSelected}
							/>
							<ReviewItem
								icon={NotebookPen}
								title="Business expenses without a note"
								done="Every business expense says what it was for"
								body="A few words on what each was for (who you met, what the software is used for) makes them much easier to claim."
								items={back(review.businessNoNote)}
								link={txLink({ tag: "business", flow: "out" })}
								accounts={accounts}
								onSelect={setSelected}
							/>
							<ReviewItem
								icon={Clock}
								title="Still pending"
								done="Nothing pending"
								body="These haven’t posted yet, so their amounts can still change."
								items={back(review.pending)}
								accounts={accounts}
								onSelect={setSelected}
							/>
						</>
					)}
				</CardContent>
			</Card>

			<div className="grid gap-4 lg:grid-cols-5 print:grid-cols-1">
				<TaxCategoryCard
					year={year}
					loading={loading}
					report={report}
					home={converter.home}
					txLink={txLink}
				/>
				<TaxPeriodCard
					loading={loading}
					report={report}
					home={converter.home}
					view={view}
					onViewChange={setView}
				/>
			</div>

			<p className="text-xs text-muted-foreground">
				Ledger adds things up; it doesn’t give tax advice. Which
				expenses you can claim depends on where you live and your
				situation, so check with your accountant.
			</p>

			<TransactionSheet
				transaction={selected}
				transactions={transactions}
				accounts={accounts}
				onClose={() => setSelected(null)}
				onSelect={setSelected}
				onUpdated={(transaction) => setSelected(transaction)}
			/>
		</div>
	)
}
