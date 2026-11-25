/** Copy and styling for one in-app confirmation dialog. */
export interface ConfirmOptions {
	title: string
	description?: string
	/** The confirm button's label. */
	action?: string
	/** Red confirm button, for deleting and other things that can't be undone. */
	destructive?: boolean
}

interface Pending extends ConfirmOptions {
	resolve: (ok: boolean) => void
}

let pending: Pending | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())

/**
 * Asks before doing something, in the app's own dialog instead of the browser's `confirm()`.
 * Resolves true when the person confirms. Needs `<ConfirmHost />` mounted once.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
	pending?.resolve(false)
	return new Promise((resolve) => {
		pending = { ...options, resolve }
		emit()
	})
}

/** Answers the open request (if any) and closes the dialog. */
export function settleConfirm(confirmed: boolean) {
	if (!pending) {
		return
	}
	pending.resolve(confirmed)
	pending = null
	emit()
}

/** For `useSyncExternalStore`: listens for a new or settled request. */
export function subscribeConfirm(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** The request the dialog should show, or null. */
export function pendingConfirm(): ConfirmOptions | null {
	return pending
}
