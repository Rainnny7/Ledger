const chains = new Map<string, Promise<void>>()

export async function withConnectionLock<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const tail = chains.get(key) ?? Promise.resolve()
  let release!: () => void
  const slot = new Promise<void>((r) => {
    release = r
  })
  chains.set(
    key,
    tail.then(() => slot)
  )
  await tail
  try {
    return await fn()
  } finally {
    release()
    if (chains.get(key) === slot) chains.delete(key)
  }
}

export const BROWSER_WORK_TIMEOUT_MS = 3 * 60 * 1000

export async function withBrowserTimeout<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          BROWSER_WORK_TIMEOUT_MS
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
