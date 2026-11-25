import { FileArchive, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatSize } from "@/components/accounts/statement-upload-utils"

/** React/UI entry: `StatementFileList`. */
export function StatementFileList({
	files,
	busy,
	onRemove,
}: {
	files: File[]
	busy: boolean
	onRemove: (file: File) => void
}) {
	if (files.length === 0) {
		return null
	}
	return (
		<ul className="grid max-h-48 gap-1 overflow-y-auto">
			{files.map((file) => (
				<li
					key={`${file.name}-${file.size}`}
					className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm"
				>
					{/\.zip$/i.test(file.name) ? (
						<FileArchive className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<FileText className="size-4 shrink-0 text-muted-foreground" />
					)}
					<span className="min-w-0 flex-1 truncate">{file.name}</span>
					<span className="text-xs text-muted-foreground tabular-nums">
						{formatSize(file.size)}
					</span>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={`Remove ${file.name}`}
						disabled={busy}
						onClick={() => onRemove(file)}
					>
						<X />
					</Button>
				</li>
			))}
		</ul>
	)
}
