import { useState } from "react"

/**
 * Returns the latest defined value, and keeps returning it after the value becomes
 * `null`/`undefined`. Dialogs derive their content from state that is cleared on close;
 * without this the content blanks or swaps while the close animation is still playing,
 * which reads as a layout shift (or no animation at all).
 *
 * @param value The live value; cleared when the dialog closes.
 * @returns The live value, or the last defined one once it has been cleared.
 */
export function useRetainedValue<Value>(
	value: Value | null | undefined
): Value | null | undefined {
	const [retained, setRetained] = useState(value)
	if (value != null && value !== retained) {
		setRetained(value)
	}
	return value ?? retained
}
