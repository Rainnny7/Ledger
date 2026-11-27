import type { ReactElement } from "react"
import { EmailLayout, EmailText } from "./email-layout.tsx"
import { renderEmailHtml } from "./render.ts"

function PasswordAddedEmail(): ReactElement {
	return (
		<EmailLayout
			preview="A password was added to your Ledger account"
			title="A password was added"
		>
			<EmailText>A password was added to your Ledger account.</EmailText>
			<EmailText muted>
				If this wasn't you, sign in with your email link and secure your
				account, or ask your Ledger admin for help.
			</EmailText>
		</EmailLayout>
	)
}

/** Plain-text and HTML for the notice sent when a passwordless account sets a password. */
export async function passwordAddedMailContent() {
	const text = [
		"A password was added to your Ledger account.",
		"",
		"If this wasn't you, sign in with your email link and secure your account, or ask your Ledger admin for help.",
	].join("\n")
	const html = await renderEmailHtml(<PasswordAddedEmail />)
	return { text, html }
}
