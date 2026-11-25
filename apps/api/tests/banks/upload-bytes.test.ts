import assert from "node:assert/strict"
import { test } from "node:test"
import { uploadKindFromBytes } from "../../src/banks/upload-bytes.ts"

test("uploadKindFromBytes detects PDF and zip signatures", () => {
	assert.equal(
		uploadKindFromBytes(
			new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
		),
		"pdf"
	)
	assert.equal(
		uploadKindFromBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])),
		"zip"
	)
	assert.equal(uploadKindFromBytes(new Uint8Array([0, 1, 2, 3])), null)
})
