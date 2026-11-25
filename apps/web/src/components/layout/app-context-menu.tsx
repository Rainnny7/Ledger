import { Copy, ExternalLink, Eye } from "lucide-react"
import { useEffect, type ReactElement, type ReactNode } from "react"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { editable } from "@/components/layout/app-context-menu-utils"
import type { Transaction } from "@/lib/api"
import { copyText } from "@/lib/clipboard"
import { formatMoney } from "@/lib/format"

/**
 * Right-click (or long-press) menu for one thing on the page. `menu` is the same
 * `DropdownMenuItem`s its "⋯" button shows, so both menus stay in step. Context and dropdown
 * menus share Base UI's item parts, so the items work in either.
 */
export function WithContextMenu({
	menu,
	children,
	className = "w-52",
}: {
	menu: ReactNode
	/** One element, which becomes the trigger. */
	children: ReactElement
	/** For the menu's popup. */
	className?: string
}) {
	if (!menu) {
		return children
	}
	return (
		<ContextMenu>
			<ContextMenuTrigger render={children} />
			<ContextMenuContent className={className}>
				{menu}
			</ContextMenuContent>
		</ContextMenu>
	)
}

/** Menu items for action link: open it here, in action new tab, or copy its address. */
export function LinkMenuItems({
	to,
	onOpen,
	label = "Open",
}: {
	to: string
	onOpen: () => void
	label?: string
}) {
	const url = new URL(to, window.location.origin).href
	return (
		<>
			<DropdownMenuItem onClick={onOpen}>
				<Eye /> {label}
			</DropdownMenuItem>
			<DropdownMenuItem
				onClick={() => window.open(url, "_blank", "noopener")}
			>
				<ExternalLink /> Open in new tab
			</DropdownMenuItem>
			<DropdownMenuItem onClick={() => void copyText(url, "Link")}>
				<Copy /> Copy link
			</DropdownMenuItem>
		</>
	)
}

/** Menu items for action transaction row. */
export function TransactionMenuItems({
	transaction,
	currency,
	onOpen,
}: {
	transaction: Transaction
	currency?: string
	onOpen: () => void
}) {
	return (
		<>
			<DropdownMenuItem onClick={onOpen}>
				<Eye /> View details
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem
				onClick={() =>
					void copyText(
						formatMoney(transaction.amount, currency),
						"Amount"
					)
				}
			>
				<Copy /> Copy amount
			</DropdownMenuItem>
			<DropdownMenuItem
				onClick={() => void copyText(transaction.merchant, "Merchant")}
			>
				<Copy /> Copy merchant
			</DropdownMenuItem>
			{transaction.description &&
				transaction.description !== transaction.merchant && (
					<DropdownMenuItem
						onClick={() =>
							void copyText(
								transaction.description,
								"Description"
							)
						}
					>
						<Copy /> Copy bank description
					</DropdownMenuItem>
				)}
		</>
	)
}

/**
 * Turns off the browser's own right-click menu, except in text fields (where it has spell check
 * and paste) and when text is selected (so copying still works). The app's own menus open on
 * the rows and cards that have actions.
 */
export function useNoNativeContextMenu() {
	useEffect(() => {
		const onContextMenu = (event: MouseEvent) => {
			if (event.defaultPrevented || editable(event.target)) {
				return
			}
			const selection = window.getSelection()
			if (
				selection &&
				!selection.isCollapsed &&
				selection.toString().trim()
			) {
				return
			}
			event.preventDefault()
		}
		document.addEventListener("contextmenu", onContextMenu)
		return () => document.removeEventListener("contextmenu", onContextMenu)
	}, [])
}
