import { useCallback, useState } from "react"
import {
	loadChatSettings,
	saveChatSettings,
	type ChatSettings,
} from "@/components/chat/chat-storage"

/** Chat display preferences (tool calls, reasoning) persisted per browser. */
export function useChatSettings() {
	const [settings, setSettings] = useState<ChatSettings>(loadChatSettings)

	const updateSettings = useCallback((patch: Partial<ChatSettings>) => {
		setSettings((previous) => {
			const next = { ...previous, ...patch }
			saveChatSettings(next)
			return next
		})
	}, [])

	return { settings, updateSettings }
}
