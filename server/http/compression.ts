import { Elysia } from "elysia"

/** Content types worth gzipping: text, JSON/JS/XML and the other text-like formats. */
const COMPRESSIBLE_CONTENT_TYPE =
	/^\s*(?:text\/(?!event-stream(?:[;\s]|$))[^;\s]+|application\/(?:javascript|json|xml|xml-dtd|ecmascript|dart|msgpack|postscript|rtf|tar|toml|vnd\.dart|vnd\.ms-fontobject|vnd\.ms-opentype|vnd\.msgpack|wasm|x-httpd-php|x-javascript|x-msgpack|x-ns-proxy-autoconfig|x-sh|x-tar|x-virtualbox-hdd|x-virtualbox-ova|x-virtualbox-ovf|x-virtualbox-vbox|x-virtualbox-vdi|x-virtualbox-vhd|x-virtualbox-vmdk|x-www-form-urlencoded)|font\/(?:otf|ttf)|image\/(?:bmp|vnd\.adobe\.photoshop|vnd\.microsoft\.icon|vnd\.ms-dds|x-icon|x-ms-bmp)|message\/rfc822|model\/gltf-binary|x-shader\/x-fragment|x-shader\/x-vertex|[^;\s]+?\+(?:json|text|xml|yaml|msgpack))(?:[;\s]|$)/i
const NO_TRANSFORM = /(?:^|,)\s*no-transform\s*(?:,|$)/i
const VARY_ACCEPT_ENCODING = /(?:^|,)\s*accept-encoding\s*(?:,|$)/i

/** Responses that declare a smaller Content-Length than this aren't worth compressing. */
const THRESHOLD_BYTES = 1024

/** Whether an Accept-Encoding header allows gzip (explicitly, or through `*`) with a non-zero weight. */
function acceptsGzip(header: string | null): boolean {
	if (!header) {
		return false
	}
	let gzipWeight: number | undefined
	let wildcardWeight: number | undefined
	for (const entry of header.split(",")) {
		const [coding = "", ...parameters] = entry.split(";")
		const weightParameter = parameters
			.map((parameter) => parameter.trim().toLowerCase())
			.find((parameter) => parameter.startsWith("q="))
		const weight = weightParameter ? Number(weightParameter.slice(2)) : 1
		const name = coding.trim().toLowerCase()
		if (name === "gzip") {
			gzipWeight = weight
		} else if (name === "*") {
			wildcardWeight = weight
		}
	}
	return (gzipWeight ?? wildcardWeight ?? 0) > 0
}

/**
 * Gzips a response when the client accepts it and the body is text-like and large enough.
 * Responses without a Content-Length (JSON built in memory) are always compressed.
 */
export function compressResponse(
	request: Request,
	response: Response
): Response {
	const { headers } = response
	const contentType = headers.get("content-type")
	const contentLength = headers.get("content-length")
	const cacheControl = headers.get("cache-control")
	// Bun adds a whole-file Content-Range to file bodies; it's only meaningful on a 206.
	if (response.status === 200) {
		headers.delete("content-range")
	}
	if (
		response.status === 206 ||
		headers.has("content-encoding") ||
		headers.has("transfer-encoding") ||
		(contentLength && Number(contentLength) < THRESHOLD_BYTES) ||
		!contentType ||
		!COMPRESSIBLE_CONTENT_TYPE.test(contentType) ||
		(cacheControl && NO_TRANSFORM.test(cacheControl))
	) {
		return response
	}
	const vary = headers.get("vary")
	if (vary !== "*" && !(vary && VARY_ACCEPT_ENCODING.test(vary))) {
		headers.set(
			"vary",
			vary ? `${vary}, Accept-Encoding` : "Accept-Encoding"
		)
	}
	if (
		!acceptsGzip(request.headers.get("accept-encoding")) ||
		!response.body
	) {
		return response
	}
	const compressed =
		request.method === "HEAD"
			? new Response(null, response)
			: new Response(
					response.body.pipeThrough(new CompressionStream("gzip")),
					response
				)
	compressed.headers.delete("content-length")
	compressed.headers.set("content-encoding", "gzip")
	const etag = compressed.headers.get("etag")
	if (etag && !etag.startsWith("W/")) {
		compressed.headers.set("etag", `W/${etag}`)
	}
	return compressed
}

/** Gzip compression for every response, applied around the whole request pipeline. */
export const compression = new Elysia({ name: "compression" }).wrap(
	(handle, request) => async (incoming: Request) =>
		compressResponse(
			request,
			(await handle(incoming)) as unknown as Response
		)
)
