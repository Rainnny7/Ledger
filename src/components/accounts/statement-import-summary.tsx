import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Link } from "react-router"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import type { StatementImport } from "@/lib/api"
import { formatDate } from "@/lib/format"

export function ImportSummary({
  result,
  onClose,
}: {
  result: StatementImport
  onClose: () => void
}) {
  const problems = result.files.filter(
    (f) => f.status === "error" || (f.status === "imported" && f.message)
  )
  const duplicates = result.files.filter((f) => f.status === "duplicate").length
  return (
    <div className="grid animate-in gap-4 duration-200 fade-in-0">
      {result.accounts.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            None of the files were TD bank account statements Ledger could read.
          </AlertDescription>
        </Alert>
      )}
      {result.accounts.map((a) => (
        <div
          key={a.accountId}
          className="grid gap-2 rounded-lg border p-3 text-sm"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <Link
                to={`/accounts/${a.accountId}`}
                onClick={onClose}
                className="font-medium underline-offset-4 hover:underline"
              >
                {a.name}
              </Link>
              <span className="text-muted-foreground"> {a.numberMasked}</span>
              {a.created && (
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · new account
                </span>
              )}
              <div className="text-xs text-muted-foreground">
                {a.statements} statement{a.statements === 1 ? "" : "s"},{" "}
                {formatDate(a.from)} – {formatDate(a.to)}
              </div>
            </div>
          </div>
          <div className="ml-6 text-xs">
            <span className="font-medium">{a.added} added</span>
            {a.existing > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · {a.existing} already in Ledger
              </span>
            )}
          </div>
          {a.gaps.length > 0 && (
            <div className="ml-6 text-xs text-amber-700 dark:text-amber-400">
              Missing statements for{" "}
              {a.gaps
                .map((g) => `${formatDate(g.from)} – ${formatDate(g.to)}`)
                .join(", ")}
            </div>
          )}
        </div>
      ))}
      {duplicates > 0 && (
        <p className="text-xs text-muted-foreground">
          Skipped {duplicates} duplicate file{duplicates === 1 ? "" : "s"} (the
          same statement uploaded twice).
        </p>
      )}
      {problems.length > 0 && (
        <ul className="grid max-h-40 gap-1 overflow-y-auto text-xs">
          {problems.map((f) => (
            <li
              key={f.name}
              className="flex items-start gap-2 text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="font-medium break-all">{f.name}</span>:{" "}
                {f.message}
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
