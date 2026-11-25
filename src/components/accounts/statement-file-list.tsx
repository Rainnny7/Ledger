import { FileArchive, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatSize } from "@/components/accounts/statement-upload-utils"

export function StatementFileList({
  files,
  busy,
  onRemove,
}: {
  files: File[]
  busy: boolean
  onRemove: (file: File) => void
}) {
  if (files.length === 0) return null
  return (
    <ul className="grid max-h-48 gap-1 overflow-y-auto">
      {files.map((f) => (
        <li
          key={`${f.name}-${f.size}`}
          className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm"
        >
          {/\.zip$/i.test(f.name) ? (
            <FileArchive className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatSize(f.size)}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${f.name}`}
            disabled={busy}
            onClick={() => onRemove(f)}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  )
}
