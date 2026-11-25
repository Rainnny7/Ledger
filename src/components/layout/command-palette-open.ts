const OPEN_EVENT = "ledger:open-palette"

export const openCommandPalette = () =>
  window.dispatchEvent(new Event(OPEN_EVENT))

export { OPEN_EVENT }
