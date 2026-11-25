import { toast } from "sonner"

/** Small helpers shared by the Work dialogs' forms. */
export const sanitizeMoneyInput = (amount: string) =>
	amount.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
/** Whether a string is a calendar date in YYYY-MM-DD form. */
export const isIsoDateString = (date: string) =>
	/^\d{4}-\d{2}-\d{2}$/.test(date)
/** Show an operation error as a toast. */
export const notifyFailure = (error: unknown) =>
	toast.error((error as Error).message)
