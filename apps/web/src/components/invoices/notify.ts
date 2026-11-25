import { toast } from "sonner"
import { toastError } from "@/lib/toast"
import { copyText } from "@/lib/work"

/** Show an operation error as a toast. */
export const notifyFailure = (error: unknown) =>
	toastError((error as Error).message)

/** React/UI entry: `copy`. */
export async function copy(text: string, what: string) {
	if (await copyText(text)) {
		toast.success(`${what} copied`)
	} else {
		toastError("Couldn’t copy to the clipboard")
	}
}
