import { escapeHtml } from "./html.ts"

/** Plain-text and HTML bodies for the magic-link sign-in email. */
export function magicLinkMailContent(linkUrl: string) {
	const text = [
		"Sign in to Ledger",
		"",
		`Use this link to log in (it expires in 10 minutes):`,
		linkUrl,
		"",
		"If you didn't request this, you can ignore this email.",
	].join("\n")
	const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Sign in to <strong>Ledger</strong></p>
  <p><a href="${escapeHtml(linkUrl)}">Log in to your account</a></p>
  <p style="color:#555;font-size:14px">This link expires in <strong>10 minutes</strong>. If you didn't request it, you can ignore this email.</p>
</body>
</html>`
	return { text, html }
}
