/** editable. */
export function editable(target: EventTarget | null) {
	if (!(target instanceof Element)) {
		return false
	}
	return !!target.closest(
		'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
	)
}
