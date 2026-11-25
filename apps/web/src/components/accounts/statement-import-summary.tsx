import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import type { StatementImport } from "@/lib/api"
import { formatDate } from "@/lib/format"

/** React/UI entry: `ImportSummary`. */
export function ImportSummary({
	result,
	onClose,
}: {
	result: StatementImport
	onClose: () => void
}) {
	const problems = result.files.filter(
		(file) =>
			file.status === "error" ||
			(file.status === "imported" && file.message)
	)
	const duplicates = result.files.filter(
		(file) => file.status === "duplicate"
	).length
	return (
		<div className="grid animate-in gap-4 duration-200 fade-in-0">
			{result.accounts.length === 0 && (
				<Alert variant="destructive">
					<AlertDescription>
						None of the files were TD bank account statements Ledger
						could read.
					</AlertDescription>
				</Alert>
			)}
			{result.accounts.map((account) => (
				<div
					key={account.accountId}
					className="grid gap-2 rounded-lg border p-3 text-sm"
				>
					<div className="flex items-start gap-2">
						<CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
						<div className="min-w-0 flex-1">
							<Link
								to="/accounts/$id"
								params={{ id: account.accountId }}
								onClick={onClose}
								className="font-medium underline-offset-4 hover:underline"
							>
								{account.name}
							</Link>
							<span className="text-muted-foreground">
								{" "}
								{account.numberMasked}
							</span>
							{account.created && (
								<span className="text-xs text-muted-foreground">
									{" "}
									· new account
								</span>
							)}
							<div className="text-xs text-muted-foreground">
								{account.statements} statement
								{account.statements === 1 ? "" : "s"},{" "}
								{formatDate(account.from)} –{" "}
								{formatDate(account.to)}
							</div>
						</div>
					</div>
					<div className="ml-6 text-xs">
						<span className="font-medium">
							{account.added} added
						</span>
						{account.existing > 0 && (
							<span className="text-muted-foreground">
								{" "}
								· {account.existing} already in Ledger
							</span>
						)}
					</div>
					{account.gaps.length > 0 && (
						<div className="ml-6 text-xs text-amber-700 dark:text-amber-400">
							Missing statements for{" "}
							{account.gaps
								.map(
									(gap) =>
										`${formatDate(gap.from)} – ${formatDate(gap.to)}`
								)
								.join(", ")}
						</div>
					)}
				</div>
			))}
			{duplicates > 0 && (
				<p className="text-xs text-muted-foreground">
					Skipped {duplicates} duplicate file
					{duplicates === 1 ? "" : "s"} (the same statement uploaded
					twice).
				</p>
			)}
			{problems.length > 0 && (
				<ul className="grid max-h-40 gap-1 overflow-y-auto text-xs">
					{problems.map((file) => (
						<li
							key={file.name}
							className="flex items-start gap-2 text-destructive"
						>
							<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
							<span className="min-w-0">
								<span className="font-medium break-all">
									{file.name}
								</span>
								: {file.message}
							</span>
						</li>
					))}
				</ul>
			)}
			<DialogFooter>
				<Button onClick={onClose}>Done</Button>
			</DialogFooter>
		</div>
	)
}
