export async function runDialogSave(
  setSaving: (v: boolean) => void,
  run: () => Promise<boolean>,
  onClose: () => void,
  e?: React.FormEvent
) {
  e?.preventDefault()
  setSaving(true)
  const ok = await run()
  setSaving(false)
  if (ok) onClose()
}