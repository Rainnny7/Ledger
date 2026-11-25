import { GitCommitHorizontal } from "lucide-react"
import { Hint } from "@/components/common/hint"
import { formatRelative, formatTimestamp } from "@/lib/format"

/** Which build of the site this is: the commit it came from and when it was built. */
const REPO_URL = "https://github.com/Rainnny7/Ledger"

export function BuildInfo() {
  const hash = import.meta.env.VITE_BUILD_GIT_HASH
  const built = import.meta.env.VITE_BUILD_TIME
  const known = hash !== "unknown"
  const content = (
    <>
      <GitCommitHorizontal className="size-3.5" />
      <code className="font-mono font-medium text-foreground">{hash}</code>
      <span aria-hidden>·</span>
      <time dateTime={built}>{formatTimestamp(built)}</time>
    </>
  )
  const className =
    "inline-flex h-7 items-center gap-2 rounded-full border bg-card px-3 text-xs text-muted-foreground"
  return (
    <Hint
      label={
        `Built ${formatTimestamp(built)} (${formatRelative(built)}) from commit ${hash}` +
        (known ? " · open it on GitHub" : "")
      }
    >
      {known ? (
        <a
          href={`${REPO_URL}/commit/${hash}`}
          target="_blank"
          rel="noreferrer"
          className={`${className} transition-colors hover:border-foreground/20 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
        >
          {content}
        </a>
      ) : (
        <span className={`${className} cursor-default`}>{content}</span>
      )}
    </Hint>
  )
}
