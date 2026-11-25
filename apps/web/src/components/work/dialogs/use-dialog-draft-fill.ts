import { useState } from "react"

/** Re-initialises local form state when a dialog opens with a new draft. */
export function useDialogDraftFill<T>(
	draft: T | null,
	fill: (value: T) => void
) {
	const [filledFrom, setFilledFrom] = useState<typeof draft>(null)
	if (draft !== filledFrom) {
		setFilledFrom(draft)
		if (draft) {
			fill(draft)
		}
	}
}
