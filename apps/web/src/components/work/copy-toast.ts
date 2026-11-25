import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { copyText } from "@/lib/work"

/** React/UI entry: `copyForChat`. */
export async function copyForChat(text: string, what: string) {
	if (await copyText(text)) {
		toast.success(`${what} copied`, {
			description: text.length > 120 ? `${text.slice(0, 120)}…` : text,
		})
	} else {
		toastError("Couldn’t copy to the clipboard")
	}
}
