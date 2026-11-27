import { useState } from "react"
import { toast } from "sonner"
import { useSavedFlash } from "@/components/common/saved-indicator"
import { toastError } from "@/lib/toast"
import { useAdminSettings } from "@/components/admin/use-admin-settings"
import { adminFetch, auditKey } from "@/lib/admin"
import { queryClient } from "@/lib/queries"

type Saving = "registration" | "aiChat" | "mcp" | null

/** Admin actions to toggle registration, AI chat, and MCP. */
export function useFeatureFlagToggles() {
	const settings = useAdminSettings()
	const [saving, setSaving] = useState<Saving>(null)
	const { saved: regSaved, flash: flashReg } = useSavedFlash()
	const { saved: aiSaved, flash: flashAi } = useSavedFlash()
	const { saved: mcpSaved, flash: flashMcp } = useSavedFlash()

	async function toggleRegistration(next: boolean) {
		setSaving("registration")
		try {
			await adminFetch("settings", {
				method: "PUT",
				body: JSON.stringify({ registrationOpen: next }),
			})
			await settings.refetch()
			void queryClient.invalidateQueries({ queryKey: auditKey })
			toast.success(
				next ? "Anyone can now create an account" : "Sign-ups closed"
			)
			flashReg()
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(null)
		}
	}

	async function toggleAiChat(next: boolean) {
		setSaving("aiChat")
		try {
			await adminFetch("settings", {
				method: "PUT",
				body: JSON.stringify({ aiChatEnabled: next }),
			})
			await settings.refetch()
			void queryClient.invalidateQueries({ queryKey: auditKey })
			void queryClient.invalidateQueries({ queryKey: ["config"] })
			toast.success(next ? "AI chat enabled" : "AI chat disabled")
			flashAi()
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(null)
		}
	}

	async function toggleMcp(next: boolean) {
		setSaving("mcp")
		try {
			await adminFetch("settings", {
				method: "PUT",
				body: JSON.stringify({ mcpEnabled: next }),
			})
			await settings.refetch()
			void queryClient.invalidateQueries({ queryKey: auditKey })
			void queryClient.invalidateQueries({ queryKey: ["config"] })
			toast.success(next ? "MCP server enabled" : "MCP server disabled")
			flashMcp()
		} catch (error) {
			toastError((error as Error).message)
		} finally {
			setSaving(null)
		}
	}

	return {
		settings,
		saving,
		regSaved,
		aiSaved,
		mcpSaved,
		toggleRegistration,
		toggleAiChat,
		toggleMcp,
	}
}
