import { Skeleton as BoneyardSkeleton } from "boneyard-js/react"
import type { ReactNode } from "react"

/**
 * A loading skeleton traced from the real page. The dev server captures each named block's layout
 * into src/bones (see boneyard.config.json), so the placeholder matches what's about to appear.
 * Until a block has been captured, `fallback` (a hand-drawn skeleton) shows instead.
 */
export function Bones({
  name,
  loading,
  fallback,
  children,
  className,
}: {
  name: string
  loading: boolean
  fallback: ReactNode
  children: ReactNode
  /** For the wrapper around the content, e.g. the page's grid gap. */
  className?: string
}) {
  return (
    <BoneyardSkeleton
      name={name}
      loading={loading}
      fallback={fallback}
      select="viewport"
      transition={250}
    >
      {/* While loading the content has no data, so render nothing under the bones. */}
      {loading ? null : <div className={className}>{children}</div>}
    </BoneyardSkeleton>
  )
}
