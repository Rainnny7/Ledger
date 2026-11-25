/** Small helpers shared by the demo generators and seeders. */
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const round = (n: number) => Math.round(n * 100) / 100

/** Small deterministic PRNG so the demo looks the same every day (just shifted). */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Draft {
  date: string
  description: string
  amount: number
}
