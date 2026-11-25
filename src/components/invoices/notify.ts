import { toast } from "sonner"
import { copyText } from "@/lib/work"

/** Show an operation error as a toast. */
export const notifyFailure = (error: unknown) =>
	toast.error((error as Error).message)

/** React/UI entry: `copy`. */
export async function copy(text: string, what: string) {
	if (await copyText(text)) {
		toast.success(`${what} copied`)
	} else {
		toast.error("Couldn’t copy to the clipboard")
	}
}
