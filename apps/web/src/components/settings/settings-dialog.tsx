import { Dialog } from "@/components/ui/dialog"
import { SettingsDialogLayout } from "@/components/settings/settings-dialog-parts"
import { useSettingsDialog } from "@/components/settings/use-settings-dialog"

/**
 * Account and server settings in one near-fullscreen dialog, opened with the
 * `?settings=<tabId>` search param so any link or palette entry can deep-link a tab.
 * Left: search plus grouped tab nav. Right: the active tab's cards.
 * Below `md` it goes fullscreen and the nav becomes a list that drills into a tab.
 */
export function SettingsDialog() {
	const state = useSettingsDialog()

	return (
		<Dialog
			open={state.open}
			onOpenChangeComplete={(nextOpen) => {
				if (!nextOpen && state.dismissed) {
					state.finishClosing()
				}
			}}
			onOpenChange={(nextOpen, eventDetails) =>
				state.handleOpenChange(nextOpen, eventDetails)
			}
		>
			<SettingsDialogLayout state={state} />
		</Dialog>
	)
}
