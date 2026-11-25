import { STATEMENT_MAX_REQUEST_BYTES } from "../../../shared/statement-upload.ts"

/** `ACCEPT` helper or constant for this feature area. */
export const ACCEPT = ".pdf,.zip,application/pdf,application/zip"
/** `STATEMENT_MAX_BYTES` helper or constant for this feature area. */
export const STATEMENT_MAX_BYTES = STATEMENT_MAX_REQUEST_BYTES

/** Whether a picked file is a PDF or ZIP statement upload. */
export const isAcceptedStatementFile = (file: File) =>
	/\.(pdf|zip)$/i.test(file.name)

/** React/UI entry: `formatSize`. */
export function formatSize(bytes: number) {
	return bytes < 1024 * 1024
		? `${Math.max(1, Math.round(bytes / 1024))} KB`
		: `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
