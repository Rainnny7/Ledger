/** Whether this device is Apple hardware, where the shortcut modifier is ⌘ rather than Ctrl. */
export const isApplePlatform =
	typeof navigator !== "undefined" &&
	/Mac|iPhone|iPad|iPod/i.test(navigator.platform)
