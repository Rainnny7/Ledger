import { Loader2, Upload } from "lucide-react"
import { type RefObject, useRef, useState } from "react"
import { toast } from "sonner"
import { InstitutionBadge } from "@/components/accounts/institution"
import { ImportSummary } from "@/components/accounts/statement-import-summary"
import { StatementFileList } from "@/components/accounts/statement-file-list"
import {
	ACCEPT,
	isAcceptedStatementFile,
	STATEMENT_MAX_BYTES,
} from "@/components/accounts/statement-upload-utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { api, type StatementImport } from "@/lib/api"
import { demoMode } from "@/lib/demo"
import { cn } from "cn"

interface Props {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** TD connection new accounts go under; the server picks one when omitted. */
	connectionId?: string
}

/** Upload TD statement PDFs (or a .zip of them) to add history from before EasyWeb's 18 months. */
export function StatementUploadDialog({
	open,
	onOpenChange,
	connectionId,
}: Props) {
	const [files, setFiles] = useState<File[]>([])
	const [dragging, setDragging] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [result, setResult] = useState<StatementImport | null>(null)
	const input = useRef<HTMLInputElement>(null)

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
		const ok = picked.filter(isAcceptedStatementFile)
		if (ok.length < picked.length) {
			toast.error("Only PDF statements and .zip archives can be uploaded")
		}
		setFiles((prev) => [
			...prev,
			...ok.filter(
				(file) =>
					!prev.some(
						(previous) =>
							previous.name === file.name &&
							previous.size === file.size
					)
			),
		])
	}

	async function upload() {
		if (demoMode) {
			return toast.error(
				"Demo mode is read-only. Exit demo mode to make changes."
			)
		}
		setBusy(true)
		setError(null)
		try {
			const response = await api.importStatements(files, connectionId)
			setResult(response)
			const added = response.accounts.reduce(
				(sum, account) => sum + account.added,
				0
			)
			if (response.accounts.length) {
				toast.success(
					added
						? `Added ${added} transaction${added === 1 ? "" : "s"}`
						: "Statements were already imported"
				)
			}
		} catch (caughtError) {
			setError(
				caughtError instanceof Error
					? caughtError.message
					: "Upload failed"
			)
		} finally {
			setBusy(false)
		}
	}

	const size = files.reduce((sum, file) => sum + file.size, 0)

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => !busy && onOpenChange(next)}
			disablePointerDismissal={busy}
		>
			<DialogContent className="sm:max-w-lg" showCloseButton={!busy}>
				<DialogHeader>
					<div className="mb-1 flex items-center gap-3">
						<InstitutionBadge institution="td" />
						<div>
							<DialogTitle>Upload TD statements</DialogTitle>
							<DialogDescription>
								Add history older than the 18 months EasyWeb
								shows, from your monthly statement PDFs.
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				{result ? (
					<ImportSummary
						result={result}
						onClose={() => onOpenChange(false)}
					/>
				) : (
					<StatementUploadForm
						busy={busy}
						error={error}
						files={files}
						size={size}
						dragging={dragging}
						input={input}
						onDrag={(isDragging) => setDragging(isDragging)}
						onAdd={add}
						onRemove={(file) =>
							setFiles((previous) =>
								previous.filter((entry) => entry !== file)
							)
						}
						onUpload={() => void upload()}
					/>
				)}
			</DialogContent>
		</Dialog>
	)
}

function StatementUploadForm({
	busy,
	error,
	files,
	size,
	dragging,
	input,
	onDrag,
	onAdd,
	onRemove,
	onUpload,
}: {
	busy: boolean
	error: string | null
	files: File[]
	size: number
	dragging: boolean
	input: RefObject<HTMLInputElement | null>
	onDrag: (dragging: boolean) => void
	onAdd: (list: FileList | null) => void
	onRemove: (file: File) => void
	onUpload: () => void
}) {
	return (
		<div className="grid animate-in gap-4 duration-200 fade-in-0">
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<button
				type="button"
				disabled={busy}
				onClick={() => input.current?.click()}
				onDragOver={(event) => {
					event.preventDefault()
					onDrag(true)
				}}
				onDragLeave={() => onDrag(false)}
				onDrop={(event) => {
					event.preventDefault()
					onDrag(false)
					onAdd(event.dataTransfer.files)
				}}
				className={cn(
					"flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center text-sm transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
					dragging && "border-primary bg-muted/60"
				)}
			>
				<Upload className="size-6 text-muted-foreground" />
				<span className="font-medium">
					Drop statements here, or click to choose
				</span>
				<span className="text-xs text-muted-foreground">
					PDF statements or a .zip of them, from EasyWeb → Statements
					(50 MB total at most)
				</span>
			</button>
			<input
				ref={input}
				type="file"
				accept={ACCEPT}
				multiple
				hidden
				onChange={(event) => {
					onAdd(event.target.files)
					event.target.value = ""
				}}
			/>

			<StatementFileList files={files} busy={busy} onRemove={onRemove} />

			<p className="text-xs text-muted-foreground">
				Chequing and savings statements are matched to your TD accounts
				by account number. Transactions already in Ledger (from a sync
				or an earlier upload) aren’t added twice.
			</p>

			<DialogFooter>
				<Button
					onClick={onUpload}
					disabled={
						busy || files.length === 0 || size > STATEMENT_MAX_BYTES
					}
				>
					{busy ? <Loader2 className="animate-spin" /> : <Upload />}
					{busy
						? "Reading statements…"
						: files.length
							? `Upload ${files.length} file${files.length === 1 ? "" : "s"}`
							: "Upload"}
				</Button>
			</DialogFooter>
		</div>
	)
}
