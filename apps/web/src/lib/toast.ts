import { toast, type ExternalToast } from "sonner"

/** Error toast that stays on screen until dismissed manually. */
export function toastError(message: string, options?: ExternalToast) {
	toast.error(message, {
		duration: Infinity,
		closeButton: true,
		...options,
	})
}
