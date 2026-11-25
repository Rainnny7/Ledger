/** A row as stored before reconciliation (`amount` in cents). */
export interface StoredTx {
  id: string
  fingerprint: string
  date: string
  description: string
  amount: number
  pending: boolean
}

const DAY_MS = 86_400_000

export function normDescription(description: string) {
  return description.toLowerCase().replace(/\s+/g, " ").trim()
}

export function descriptionsSimilar(a: string, b: string) {
  const na = normDescription(a)
  const nb = normDescription(b)
  if (!na || !nb) return na === nb
  return na === nb || na.includes(nb) || nb.includes(na)
}

export function daysApart(a: string, b: string) {
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  return Math.abs(da - db) / DAY_MS
}

export function amountsMatch(a: number, b: number) {
  return a === b
}

export function transactionMatchScore(source: StoredTx, target: StoredTx) {
  if (!amountsMatch(source.amount, target.amount)) return null
  if (!descriptionsSimilar(source.description, target.description)) return null
  const days = daysApart(source.date, target.date)
  if (days > 7) return null
  return days
}

/**
 * Decide which stored rows lose their fingerprint on this sync and should donate
 * annotations to a newly posted row (pending cleared, or bank edited date/description).
 */
export function planTransactionCarryOvers(
  stored: StoredTx[],
  incomingFingerprints: Set<string>,
  syncDateMin: string,
  syncDateMax: string
): { pairs: { fromId: string; toId: string }[]; deleteIds: string[] } {
  if (incomingFingerprints.size === 0) return { pairs: [], deleteIds: [] }

  const sources: StoredTx[] = []
  for (const row of stored) {
    if (incomingFingerprints.has(row.fingerprint)) continue
    if (row.pending) sources.push(row)
    else if (row.date >= syncDateMin && row.date <= syncDateMax)
      sources.push(row)
  }

  const targets = stored.filter(
    (row) => !row.pending && incomingFingerprints.has(row.fingerprint)
  )

  const sortedSources = sources.toSorted((a, b) =>
    a.date === b.date
      ? a.fingerprint.localeCompare(b.fingerprint)
      : a.date.localeCompare(b.date)
  )
  const sortedTargets = targets.toSorted((a, b) =>
    a.date === b.date
      ? a.fingerprint.localeCompare(b.fingerprint)
      : a.date.localeCompare(b.date)
  )

  const usedTargets = new Set<string>()
  const pairs: { fromId: string; toId: string }[] = []

  for (const source of sortedSources) {
    let best: { id: string; score: number } | null = null
    for (const target of sortedTargets) {
      if (usedTargets.has(target.id) || target.id === source.id) continue
      const score = transactionMatchScore(source, target)
      if (score === null) continue
      if (!best || score < best.score) best = { id: target.id, score }
    }
    if (best) {
      usedTargets.add(best.id)
      pairs.push({ fromId: source.id, toId: best.id })
    }
  }

  const deleteIds = sources.map((s) => s.id)
  return { pairs, deleteIds }
}
