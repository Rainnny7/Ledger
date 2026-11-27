/**
 * Cross-page bridge into the floating Ask Ledger chat: open the panel and send a prefilled prompt.
 */

const listeners = new Set<() => void>()

let queue: string[] = []
let tick = 0

function emit() {
	tick += 1
	for (const listener of listeners) {
		listener()
	}
}

/**
 * Opens Ask Ledger (when mounted) and sends `prompt` through the chat widget's normal send path.
 * While a reply is streaming, additional prompts wait in a FIFO queue.
 */
export function askLedger(prompt: string): void {
	const trimmed = prompt.trim()
	if (!trimmed) {
		return
	}
	queue.push(trimmed)
	emit()
}

/** For `useSyncExternalStore`: bumps whenever the queue changes. */
export function askLedgerRevision(): number {
	return tick
}

/** Subscribe to ask-ledger queue updates (for the chat widget). */
export function subscribeAskLedger(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** Snapshot of queued prompts (read-only; do not mutate). */
export function peekAskLedgerQueue(): readonly string[] {
	return queue
}

/** Removes and returns the next queued prompt, if any. */
export function shiftAskLedgerQueue(): string | undefined {
	if (queue.length === 0) {
		return undefined
	}
	return queue.shift()
}
