import { toast } from "sonner"
import { toastError } from "@/lib/toast"

/** Copies text and says so in a toast, or says it couldn't. `what` names it, e.g. "Link". */
export async function copyText(text: string, what: string) {
	try {
		await navigator.clipboard.writeText(text)
		toast.success(`${what} copied`)
	} catch {
		toastError(`Couldn't copy the ${what.toLowerCase()}`)
	}
}
