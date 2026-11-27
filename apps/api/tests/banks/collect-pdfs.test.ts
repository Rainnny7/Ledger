import assert from "node:assert/strict"
import { test } from "node:test"
import { zipSync } from "fflate"
import { collectPdfs } from "../../src/banks/statements.ts"

const MAX_PDF_BYTES = 25 * 1024 * 1024

function minimalPdf(byteLength: number): Uint8Array {
	const bytes = new Uint8Array(byteLength)
	bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x30], 0)
	bytes.set([0x25, 0x25, 0x45, 0x4f, 0x46], byteLength - 5)
	return bytes
}

/** Lie about uncompressed size in central-directory records (what unzipSync filter reads). */
function patchZipCentralDeclaredSize(
	zip: Uint8Array,
	declared: number
): Uint8Array {
	const patched = new Uint8Array(zip)
	for (let offset = 0; offset + 46 < patched.length; offset++) {
		if (
			patched[offset] === 0x50 &&
			patched[offset + 1] === 0x4b &&
			patched[offset + 2] === 0x01 &&
			patched[offset + 3] === 0x02
		) {
			patched[offset + 24] = declared & 0xff
			patched[offset + 25] = (declared >> 8) & 0xff
			patched[offset + 26] = (declared >> 16) & 0xff
			patched[offset + 27] = (declared >> 24) & 0xff
		}
	}
	return patched
}

test("collectPdfs rejects a zip entry whose declared size lies", () => {
	const oversized = minimalPdf(MAX_PDF_BYTES + 1)
	const archive = patchZipCentralDeclaredSize(
		zipSync({ "statement.pdf": oversized }),
		512
	)
	const { pdfs, rejected } = collectPdfs([
		{ name: "statements.zip", bytes: archive },
	])
	assert.equal(pdfs.length, 0)
	assert.ok(
		rejected.some(
			(entry) =>
				entry.status === "error" &&
				entry.message === "Too large for a statement"
		)
	)
})
