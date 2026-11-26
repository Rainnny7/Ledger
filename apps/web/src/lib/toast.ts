import { toast, type ExternalToast } from "sonner"

/** Error toast that stays on screen until dismissed manually. */
export function toastError(message: string, options?: ExternalToast) {
	toast.error(message, {
		duration: Infinity,
		closeButton: true,
		...options,
	})
}

/** Greets someone who just logged in, by first name when known. */
export function toastWelcome(name?: string | null) {
	const firstName = name?.trim().split(/\s+/)[0]
	toast.success(firstName ? `Hello, ${firstName}! 👋` : "Hello there! 👋", {
		description: "Welcome back to Ledger.",
	})
}

/** Says goodbye after logging out. */
export function toastGoodbye() {
	toast.success("Goodbye for now! 👋", {
		description: "You’re logged out. See you soon.",
	})
}
