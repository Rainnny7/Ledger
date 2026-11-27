import { Unzip, UnzipInflate, type UnzipFile } from "fflate"

const ARCHIVE_TOO_LARGE = "Archive is too large"

function pdfNameAllowed(name: string): boolean {
	if (!/\.pdf$/i.test(name)) {
		return false
	}
	if (/(^|\/)(__MACOSX|\.)/.test(name)) {
		return false
	}
	return true
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
	let length = 0
	for (const chunk of chunks) {
		length += chunk.byteLength
	}
	const merged = new Uint8Array(length)
	let offset = 0
	for (const chunk of chunks) {
		merged.set(chunk, offset)
		offset += chunk.byteLength
	}
	return merged
}

/**
 * Inflates PDF entries from one ZIP buffer, counting real decompressed bytes instead of trusting
 * headers. Rejects single entries over `maxPdfBytes` and aborts when `maxTotalBytes` or
 * `maxFiles` is exceeded.
 */
export function unzipPdfEntries(
	bytes: Uint8Array,
	limits: {
		maxPdfBytes: number
		maxTotalBytes: number
		maxFiles: number
	},
	counters: { total: number; count: number },
	rejectEntry: (name: string, message: string) => void
): Record<string, Uint8Array> {
	const entries: Record<string, Uint8Array> = {}
	let archiveFailed = false
	let archiveError: string | null = null

	const unzip = new Unzip((file: UnzipFile) => {
		if (archiveFailed) {
			return
		}
		const { name } = file
		if (!pdfNameAllowed(name)) {
			return
		}
		if (++counters.count > limits.maxFiles) {
			archiveFailed = true
			archiveError = ARCHIVE_TOO_LARGE
			file.terminate()
			return
		}
		const chunks: Uint8Array[] = []
		let entryBytes = 0
		let entryRejected = false
		file.ondata = (error, chunk, final) => {
			if (archiveFailed || entryRejected) {
				return
			}
			if (error) {
				archiveFailed = true
				archiveError = null
				return
			}
			entryBytes += chunk.byteLength
			counters.total += chunk.byteLength
			if (entryBytes > limits.maxPdfBytes) {
				entryRejected = true
				counters.total -= entryBytes
				counters.count -= 1
				rejectEntry(name, "Too large for a statement")
				file.terminate()
				return
			}
			if (counters.total > limits.maxTotalBytes) {
				archiveFailed = true
				archiveError = ARCHIVE_TOO_LARGE
				entryRejected = true
				file.terminate()
				return
			}
			chunks.push(chunk)
			if (final) {
				entries[name] = concatChunks(chunks)
			}
		}
		file.start()
	})
	unzip.register(UnzipInflate)
	unzip.push(bytes, true)

	if (archiveError === ARCHIVE_TOO_LARGE) {
		throw new Error(ARCHIVE_TOO_LARGE)
	}
	if (archiveFailed && archiveError === null) {
		throw new Error("Could not open this archive")
	}
	return entries
}

/** Maps unzip failures to the messages `collectPdfs` returns for rejected archives. */
export function archiveErrorMessage(error: unknown): string {
	if ((error as Error).message === ARCHIVE_TOO_LARGE) {
		return ARCHIVE_TOO_LARGE
	}
	return "Could not open this archive"
}