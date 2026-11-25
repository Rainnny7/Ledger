import { useEffect, useState } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog"
import { OPEN_EVENT } from "@/components/layout/command-palette-open"
import { Palette } from "@/components/layout/palette"

/** ⌘K / Ctrl+K: jump anywhere, find anything, or do the common things without hunting for the button. */
export function CommandPalette() {
	const [open, setOpen] = useState(false)

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (
				event.key.toLowerCase() === "k" &&
				(event.metaKey || event.ctrlKey) &&
				!event.altKey
			) {
				event.preventDefault()
				setOpen((isOpen) => !isOpen)
			}
		}
		const onOpen = () => setOpen(true)
		window.addEventListener("keydown", onKey)
		window.addEventListener(OPEN_EVENT, onOpen)
		return () => {
			window.removeEventListener("keydown", onKey)
			window.removeEventListener(OPEN_EVENT, onOpen)
		}
	}, [])

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				showCloseButton={false}
				className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 ring-primary/25 sm:max-w-xl"
			>
				<DialogTitle className="sr-only">Command menu</DialogTitle>
				<DialogDescription className="sr-only">
					Search pages, accounts, goals, bills, invoices and
					transactions, or run an action
				</DialogDescription>
				{open && <Palette onDone={() => setOpen(false)} />}
			</DialogContent>
		</Dialog>
	)
}
