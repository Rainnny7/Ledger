const chains = new Map<string, Promise<void>>()

/** Serialize sync work per bank connection to avoid overlapping sessions. */
export async function withConnectionLock<T>(
	key: string,
	fn: () => Promise<T>
): Promise<T> {
	const tail = chains.get(key) ?? Promise.resolve()
	let release!: () => void
	const slot = new Promise<void>((resolve) => {
		release = resolve
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
		if (chains.get(key) === slot) {
			chains.delete(key)
		}
	}
}

/** Hard timeout for browser-based bank sync work. */
export const BROWSER_WORK_TIMEOUT_MS = 3 * 60 * 1000

/** Abort browser bank work that exceeds BROWSER_WORK_TIMEOUT_MS. */
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
		if (timer) {
			clearTimeout(timer)
		}
	}
}
