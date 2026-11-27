import type { ReactElement } from "react"
import {
	EmailButton,
	EmailLayout,
	EmailLinkFallback,
	EmailText,
} from "./email-layout.tsx"
import { renderEmailHtml } from "./render.ts"

function MagicLinkEmail({ linkUrl }: { linkUrl: string }): ReactElement {
	return (
		<EmailLayout
			preview="Your Ledger login link"
			title="Sign in to Ledger"
			footer="If you didn't request this, you can ignore this email."
		>
			<EmailText>
				Use the button below to log in. The link expires in{" "}
				<strong>10 minutes</strong>.
			</EmailText>
			<EmailButton href={linkUrl}>Log in to your account</EmailButton>
			<EmailLinkFallback href={linkUrl} />
		</EmailLayout>
	)
}

/** Plain-text and HTML bodies for the magic-link sign-in email. */
export async function magicLinkMailContent(linkUrl: string) {
	const text = [
		"Sign in to Ledger",
		"",
		`Use this link to log in (it expires in 10 minutes):`,
		linkUrl,
		"",
		"If you didn't request this, you can ignore this email.",
	].join("\n")
	const html = await renderEmailHtml(<MagicLinkEmail linkUrl={linkUrl} />)
	return { text, html }
}
