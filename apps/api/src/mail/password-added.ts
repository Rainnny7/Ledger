/** Plain-text and HTML for the notice sent when a passwordless account sets a password. */
export function passwordAddedMailContent() {
	const text = [
		"A password was added to your Ledger account.",
		"",
		"If this wasn't you, sign in with your email link and secure your account, or ask your Ledger admin for help.",
	].join("\n")
	const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>A password was added to your <strong>Ledger</strong> account.</p>
  <p style="color:#555;font-size:14px">If this wasn't you, sign in with your email link and secure your account, or ask your Ledger admin for help.</p>
</body>
</html>`
	return { text, html }
}
