import type { ReactElement } from "react"
import {
	EmailButton,
	EmailLayout,
	EmailLinkFallback,
	EmailText,
} from "./email-layout.tsx"
import { renderEmailHtml } from "./render.ts"

function VerifyEmail({ linkUrl }: { linkUrl: string }): ReactElement {
	return (
		<EmailLayout
			preview="Confirm your email address for Ledger"
			title="Verify your email"
			footer="If you didn't request this, you can ignore this email."
		>
			<EmailText>
				Confirm that this address belongs to you to finish setting up your
				Ledger account.
			</EmailText>
			<EmailButton href={linkUrl}>Verify this email address</EmailButton>
			<EmailLinkFallback href={linkUrl} />
		</EmailLayout>
	)
}

/** Plain-text and HTML bodies for the verify-email message. */
export async function verifyEmailMailContent(linkUrl: string) {
	const text = [
		"Verify your Ledger email",
		"",
		"Confirm this address belongs to you:",
		linkUrl,
		"",
		"If you didn't request this, you can ignore this email.",
	].join("\n")
	const html = await renderEmailHtml(<VerifyEmail linkUrl={linkUrl} />)
	return { text, html }
}
