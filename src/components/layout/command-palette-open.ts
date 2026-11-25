const OPEN_EVENT = "ledger:open-palette"

/** openCommandPalette. */
export const openCommandPalette = () =>
	window.dispatchEvent(new Event(OPEN_EVENT))

export { OPEN_EVENT }
