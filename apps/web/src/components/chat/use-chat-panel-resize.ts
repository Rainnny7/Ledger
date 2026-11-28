import { useCallback, useState, type PointerEvent } from "react"
import {
	loadChatSize,
	MIN_CHAT_SIZE,
	saveChatSize,
	type ChatPanelSize,
} from "@/components/chat/chat-storage"

/** Which axes a resize handle moves. The panel is anchored bottom-right, so only the left/top edges grow it. */
export type ResizeEdges = { horizontal: boolean; vertical: boolean }

/** Resizable panel dimensions: drag handles on the left edge, top edge or top-left corner. */
export function useChatPanelResize() {
	const [size, setSize] = useState<ChatPanelSize>(loadChatSize)

	const startResize = useCallback(
		(event: PointerEvent<HTMLElement>, edges: ResizeEdges) => {
			event.preventDefault()
			const handle = event.currentTarget
			handle.setPointerCapture(event.pointerId)
			const startX = event.clientX
			const startY = event.clientY
			const startSize = size
			const maxWidth = window.innerWidth - 40
			const maxHeight = window.innerHeight - 80
			let latest = startSize

			const onMove = (moveEvent: globalThis.PointerEvent) => {
				latest = {
					width: edges.horizontal
						? Math.min(
								maxWidth,
								Math.max(
									MIN_CHAT_SIZE.width,
									startSize.width + startX - moveEvent.clientX
								)
							)
						: startSize.width,
					height: edges.vertical
						? Math.min(
								maxHeight,
								Math.max(
									MIN_CHAT_SIZE.height,
									startSize.height +
										startY -
										moveEvent.clientY
								)
							)
						: startSize.height,
				}
				setSize(latest)
			}
			const onEnd = () => {
				handle.removeEventListener("pointermove", onMove)
				handle.removeEventListener("pointerup", onEnd)
				handle.removeEventListener("pointercancel", onEnd)
				saveChatSize(latest)
			}
			handle.addEventListener("pointermove", onMove)
			handle.addEventListener("pointerup", onEnd)
			handle.addEventListener("pointercancel", onEnd)
		},
		[size]
	)

	return { size, startResize }
}
