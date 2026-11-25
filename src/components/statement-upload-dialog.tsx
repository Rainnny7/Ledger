import { AlertTriangle, CheckCircle2, FileArchive, FileText, Loader2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { InstitutionBadge } from '@/components/institution'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, type StatementImport } from '@/lib/api'
import { demoMode } from '@/lib/demo'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** TD connection new accounts go under; the server picks one when omitted. */
  connectionId?: string
}

const ACCEPT = '.pdf,.zip,application/pdf,application/zip'
const accepted = (f: File) => /\.(pdf|zip)$/i.test(f.name)

/** Upload TD statement PDFs (or a .zip of them) to add history from before EasyWeb's 18 months. */
export function StatementUploadDialog({ open, onOpenChange, connectionId }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StatementImport | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Start fresh each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setFiles([])
      setError(null)
      setResult(null)
    }
  }

  function add(list: FileList | null) {
    const picked = [...(list ?? [])]
    const ok = picked.filter(accepted)
    if (ok.length < picked.length) toast.error('Only PDF statements and .zip archives can be uploaded')
    setFiles((prev) => [...prev, ...ok.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))])
  }

  async function upload() {
    if (demoMode) return toast.error('Demo mode is read-only. Exit demo mode to make changes.')
    setBusy(true)
    setError(null)
    try {
      const r = await api.importStatements(files, connectionId)
      setResult(r)
      const added = r.accounts.reduce((s, a) => s + a.added, 0)
      if (r.accounts.length) toast.success(added ? `Added ${added} transaction${added === 1 ? '' : 's'}` : 'Statements were already imported')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const size = files.reduce((s, f) => s + f.size, 0)

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)} disablePointerDismissal={busy}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <InstitutionBadge institution="td" />
            <div>
              <DialogTitle>Upload TD statements</DialogTitle>
              <DialogDescription>
                Add history older than the 18 months EasyWeb shows, from your monthly statement PDFs.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {result ? (
          <ImportSummary result={result} onClose={() => onOpenChange(false)} />
        ) : (
          <div className="grid gap-4 animate-in fade-in-0 duration-200">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                add(e.dataTransfer.files)
              }}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                dragging && 'border-primary bg-muted/60',
              )}
            >
              <Upload className="size-6 text-muted-foreground" />
              <span className="font-medium">Drop statements here, or click to choose</span>
              <span className="text-xs text-muted-foreground">PDF statements or a .zip of them, from EasyWeb → Statements</span>
            </button>
            <input
              ref={input}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                add(e.target.files)
                e.target.value = ''
              }}
            />

            {files.length > 0 && (
              <ul className="grid max-h-48 gap-1 overflow-y-auto">
                {files.map((f) => (
                  <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                    {/\.zip$/i.test(f.name) ? (
                      <FileArchive className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatSize(f.size)}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${f.name}`}
                      disabled={busy}
                      onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-muted-foreground">
              Chequing and savings statements are matched to your TD accounts by account number. Transactions already in Ledger
              (from a sync or an earlier upload) aren’t added twice.
            </p>

            <DialogFooter>
              <Button onClick={() => void upload()} disabled={busy || files.length === 0 || size > 100 * 1024 * 1024}>
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                {busy ? 'Reading statements…' : files.length ? `Upload ${files.length} file${files.length === 1 ? '' : 's'}` : 'Upload'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ImportSummary({ result, onClose }: { result: StatementImport; onClose: () => void }) {
  const problems = result.files.filter((f) => f.status === 'error' || (f.status === 'imported' && f.message))
  const duplicates = result.files.filter((f) => f.status === 'duplicate').length
  return (
    <div className="grid gap-4 animate-in fade-in-0 duration-200">
      {result.accounts.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>None of the files were TD bank account statements Ledger could read.</AlertDescription>
        </Alert>
      )}
      {result.accounts.map((a) => (
        <div key={a.accountId} className="grid gap-2 rounded-lg border p-3 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0 flex-1">
              <Link to={`/accounts/${a.accountId}`} onClick={onClose} className="font-medium underline-offset-4 hover:underline">
                {a.name}
              </Link>
              <span className="text-muted-foreground"> {a.numberMasked}</span>
              {a.created && <span className="text-xs text-muted-foreground"> · new account</span>}
              <div className="text-xs text-muted-foreground">
                {a.statements} statement{a.statements === 1 ? '' : 's'}, {formatDate(a.from)} – {formatDate(a.to)}
              </div>
            </div>
          </div>
          <div className="ml-6 text-xs">
            <span className="font-medium">{a.added} added</span>
            {a.existing > 0 && <span className="text-muted-foreground"> · {a.existing} already in Ledger</span>}
          </div>
          {a.gaps.length > 0 && (
            <div className="ml-6 text-xs text-amber-700 dark:text-amber-400">
              Missing statements for {a.gaps.map((g) => `${formatDate(g.from)} – ${formatDate(g.to)}`).join(', ')}
            </div>
          )}
        </div>
      ))}
      {duplicates > 0 && (
        <p className="text-xs text-muted-foreground">
          Skipped {duplicates} duplicate file{duplicates === 1 ? '' : 's'} (the same statement uploaded twice).
        </p>
      )}
      {problems.length > 0 && (
        <ul className="grid max-h-40 gap-1 overflow-y-auto text-xs">
          {problems.map((f) => (
            <li key={f.name} className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                <span className="break-all font-medium">{f.name}</span>: {f.message}
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

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
