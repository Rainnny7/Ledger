/** UploadKind values accepted by validation and routes. */
export type UploadKind = "pdf" | "zip"

const PDF_SIG = [0x25, 0x50, 0x44, 0x46, 0x2d] as const // %PDF-
const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04] as const

function hasPrefix(bytes: Uint8Array, sig: readonly number[]) {
	if (bytes.byteLength < sig.length) {
		return false
	}
	for (let i = 0; i < sig.length; i++) {
		if (bytes[i] !== sig[i]) {
			return false
		}
	}
	return true
}

/** Magic-byte check for statement uploads (extension alone is not trusted). */
export function uploadKindFromBytes(bytes: Uint8Array): UploadKind | null {
	if (hasPrefix(bytes, PDF_SIG)) {
		return "pdf"
	}
	if (hasPrefix(bytes, ZIP_SIG)) {
		return "zip"
	}
	return null
}

/** Infer statement upload kind from file extension. */
export function uploadKindForName(name: string): UploadKind | "unknown" {
	if (/\.pdf$/i.test(name)) {
		return "pdf"
	}
	if (/\.zip$/i.test(name)) {
		return "zip"
	}
	return "unknown"
}
