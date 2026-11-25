/** The fields needed to put a day's transactions in the order they happened. */
export interface OrderableTx {
  accountId: string
  date: string
  amount: number
  runningBalance: number | null
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.005

/**
 * Newest-first order for one account's transactions on one day, rebuilt from running balances: the
 * newest is the one whose balance no other row leads to, and each earlier one ends at
 * `balance - amount` of the one after it. Null when the balances don't form one clean chain.
 */
function chain<T extends OrderableTx>(items: T[]): T[] | null {
  if (items.length < 2 || items.some((t) => t.runningBalance === null))
    return null
  const before = (t: T) => t.runningBalance! - t.amount
  const heads = items.filter(
    (x) => !items.some((y) => y !== x && same(before(y), x.runningBalance!))
  )
  if (heads.length !== 1) return null
  const out = [heads[0]]
  const left = new Set(items.filter((t) => t !== heads[0]))
  while (left.size) {
    const cur = out.at(-1)!
    const next = [...left].filter((t) => same(t.runningBalance!, before(cur)))
    if (next.length !== 1) return null
    out.push(next[0])
    left.delete(next[0])
  }
  return out
}

/**
 * Banks only give a posting date, so a day's rows arrive in whatever order they were stored. Where an
 * account's running balances say which came first, reorder that account's rows within the day to
 * match (newest first), leaving every other row where it was.
 */
export function orderWithinDays<T extends OrderableTx>(rows: T[]): T[] {
  const out = [...rows]
  let start = 0
  while (start < out.length) {
    let end = start
    while (end < out.length && out[end].date === out[start].date) end++
    const byAccount = new Map<string, number[]>()
    for (let i = start; i < end; i++) {
      const slots = byAccount.get(out[i].accountId) ?? []
      slots.push(i)
      byAccount.set(out[i].accountId, slots)
    }
    for (const slots of byAccount.values()) {
      const ordered = chain(slots.map((i) => out[i]))
      if (ordered) slots.forEach((slot, k) => (out[slot] = ordered[k]))
    }
    start = end
  }
  return out
}
