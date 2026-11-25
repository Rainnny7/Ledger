import { Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { UpdateInfo } from "@/lib/api"
import { copyText } from "@/lib/clipboard"
import { formatTimestamp } from "@/lib/format"

const NOTES_MAX = 1200

function truncateNotes(notes: string) {
  if (notes.length <= NOTES_MAX) return notes
  return `${notes.slice(0, NOTES_MAX).trimEnd()}…`
}

export function UpdateDialog({
  open,
  onOpenChange,
  info,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  info: UpdateInfo
}) {
  const script = info.commands.join("\n")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            {info.current} → {info.latest}
            {info.publishedAt ? (
              <>
                {" "}
                · published{" "}
                <time dateTime={info.publishedAt}>
                  {formatTimestamp(info.publishedAt)}
                </time>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {info.notes ? (
          <pre className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3 font-sans text-sm whitespace-pre-wrap text-muted-foreground">
            {truncateNotes(info.notes)}
          </pre>
        ) : null}
        {info.url ? (
          <a
            href={info.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Release on GitHub <ExternalLink className="size-3.5" />
          </a>
        ) : null}
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {info.install === "docker" ? "Docker" : "From source"}
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void copyText(script, "Commands")}
            >
              <Copy /> Copy
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md border bg-muted/60 p-3 font-mono text-xs leading-relaxed">
            {script}
          </pre>
          <p className="text-xs text-muted-foreground">
            Run these on the server, then restart or redeploy so the new build
            is live. Ledger cannot restart itself from here.
          </p>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
