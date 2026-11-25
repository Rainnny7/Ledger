/** React/UI entry: `runDialogSave`. */
export async function runDialogSave(
	setSaving: (value: boolean) => void,
	run: () => Promise<boolean>,
	onClose: () => void,
	e?: React.FormEvent
) {
	e?.preventDefault()
	setSaving(true)
	const ok = await run()
	setSaving(false)
	if (ok) {
		onClose()
	}
}
