import type { ReactElement } from "react"
import {
	EmailButton,
	EmailLayout,
	EmailLinkFallback,
	EmailText,
} from "./email-layout.tsx"
import { renderEmailHtml } from "./render.ts"

function DeleteAccountEmail({ linkUrl }: { linkUrl: string }): ReactElement {
	return (
		<EmailLayout
			preview="Confirm deleting your Ledger account"
			title="Delete your Ledger account"
			footer="If you didn't request this, sign in and change your password, or ignore this email."
		>
			<EmailText>
				This link confirms you want to delete your account and{" "}
				<strong>all of its data</strong>.
			</EmailText>
			<EmailButton href={linkUrl}>Confirm account deletion</EmailButton>
			<EmailLinkFallback href={linkUrl} />
		</EmailLayout>
	)
}

/** Plain-text and HTML for the delete-account confirmation email. */
export async function deleteAccountMailContent(linkUrl: string) {
	const text = [
		"Delete your Ledger account",
		"",
		"This link confirms you want to delete your account and all of its data:",
		linkUrl,
		"",
		"If you didn't request this, sign in and change your password, or ignore this email.",
	].join("\n")
	const html = await renderEmailHtml(<DeleteAccountEmail linkUrl={linkUrl} />)
	return { text, html }
}
