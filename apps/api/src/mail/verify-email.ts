import { escapeHtml } from "./html.ts"

/** Plain-text and HTML bodies for the verify-email message. */
export function verifyEmailMailContent(linkUrl: string) {
	const text = [
		"Verify your Ledger email",
		"",
		"Confirm this address belongs to you:",
		linkUrl,
		"",
		"If you didn't request this, you can ignore this email.",
	].join("\n")
	const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Verify your email for <strong>Ledger</strong></p>
  <p><a href="${escapeHtml(linkUrl)}">Verify this email address</a></p>
  <p style="color:#555;font-size:14px">If you didn't request this, you can ignore this email.</p>
</body>
</html>`
	return { text, html }
}
