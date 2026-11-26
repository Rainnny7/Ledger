// Owns the loading messages so the first paint already shows one. The app's loader reads the same
// order (window.__loaderMessages) and clock, so the message doesn't change when it takes over.
;(function () {
	var messages = [
		"Balancing the books…",
		"Counting your coins…",
		"Sharpening pencils…",
		"Reconciling accounts…",
		"Filing the paperwork…",
		"Polishing the ledger…",
		"Adding it all up…",
		"Checking the math twice…",
		"Stamping receipts…",
		"Tallying the totals…",
	].sort(function () {
		return Math.random() - 0.5
	})
	window.__loaderMessages = messages
	var message = document.createElement("span")
	message.className = "app-loader-message"
	message.textContent =
		messages[Math.floor(performance.now() / 3200) % messages.length]
	document.querySelector(".app-loader-text").appendChild(message)
})()
