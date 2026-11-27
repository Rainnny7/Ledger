import { escapeHtml } from "./html.ts"

/** Plain-text and HTML for the delete-account confirmation email. */
export function deleteAccountMailContent(linkUrl: string) {
	const text = [
		"Delete your Ledger account",
		"",
		"This link confirms you want to delete your account and all of its data:",
		linkUrl,
		"",
		"If you didn't request this, sign in and change your password, or ignore this email.",
	].join("\n")
	const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Delete your <strong>Ledger</strong> account</p>
  <p><a href="${escapeHtml(linkUrl)}">Confirm account deletion</a></p>
  <p style="color:#555;font-size:14px">If you didn't request this, you can ignore this email.</p>
</body>
</html>`
	return { text, html }
}
