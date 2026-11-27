import {
	Body,
	Button,
	Container,
	Head,
	Hr,
	Html,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components"
import type { CSSProperties, ReactElement, ReactNode } from "react"
import { EMAIL_COLORS, EMAIL_FONT_FAMILY } from "./theme.ts"

const styles = {
	body: {
		margin: 0,
		padding: "32px 12px",
		backgroundColor: EMAIL_COLORS.page,
		fontFamily: EMAIL_FONT_FAMILY,
		color: EMAIL_COLORS.text,
	},
	container: {
		maxWidth: "560px",
		margin: "0 auto",
	},
	brand: {
		margin: "0 0 16px",
		padding: "0 4px",
		fontSize: "18px",
		fontWeight: 700,
		letterSpacing: "-0.01em",
		color: EMAIL_COLORS.primary,
	},
	card: {
		backgroundColor: EMAIL_COLORS.card,
		border: `1px solid ${EMAIL_COLORS.border}`,
		borderRadius: "14px",
		padding: "32px 28px",
	},
	title: {
		margin: "0 0 12px",
		fontSize: "22px",
		lineHeight: "1.3",
		fontWeight: 700,
		color: EMAIL_COLORS.text,
	},
	footer: {
		margin: "16px 0 0",
		padding: "0 4px",
		fontSize: "12px",
		lineHeight: "1.5",
		color: EMAIL_COLORS.muted,
	},
} satisfies Record<string, CSSProperties>

/** Props for {@link EmailLayout}. */
export interface EmailLayoutProps {
	/** Inbox preview text shown beside the subject. */
	preview: string
	/** Heading at the top of the card; omit when the body supplies its own. */
	title?: string
	/** Replaces the default footer line (for example with an unsubscribe notice). */
	footer?: ReactNode
	children: ReactNode
}

/** Shared shell for every Ledger email: wordmark, white card on a warm page, and a footer. */
export function EmailLayout({
	preview,
	title,
	footer,
	children,
}: EmailLayoutProps): ReactElement {
	return (
		<Html lang="en">
			<Head>
				<meta name="color-scheme" content="light" />
			</Head>
			<Preview>{preview}</Preview>
			<Body style={styles.body}>
				<Container style={styles.container}>
					<Text style={styles.brand}>Ledger</Text>
					<Section style={styles.card}>
						{title ? <Text style={styles.title}>{title}</Text> : null}
						{children}
					</Section>
					<Text style={styles.footer}>
						{footer ?? "Sent by your Ledger instance."}
					</Text>
				</Container>
			</Body>
		</Html>
	)
}

/** Body paragraph; `muted` renders the smaller secondary style. */
export function EmailText({
	children,
	muted = false,
}: {
	children: ReactNode
	muted?: boolean
}): ReactElement {
	return (
		<Text
			style={{
				margin: "0 0 16px",
				fontSize: muted ? "13px" : "15px",
				lineHeight: "1.6",
				color: muted ? EMAIL_COLORS.muted : EMAIL_COLORS.text,
			}}
		>
			{children}
		</Text>
	)
}

/** Primary call-to-action button. */
export function EmailButton({
	href,
	children,
}: {
	href: string
	children: ReactNode
}): ReactElement {
	return (
		<Section style={{ margin: "8px 0 20px" }}>
			<Button
				href={href}
				style={{
					display: "inline-block",
					padding: "12px 22px",
					borderRadius: "10px",
					backgroundColor: EMAIL_COLORS.primary,
					color: EMAIL_COLORS.primaryForeground,
					fontSize: "15px",
					fontWeight: 600,
					textDecoration: "none",
				}}
			>
				{children}
			</Button>
		</Section>
	)
}

/** Fallback line with the raw URL, for clients that block buttons. */
export function EmailLinkFallback({ href }: { href: string }): ReactElement {
	return (
		<>
			<Hr style={{ borderColor: EMAIL_COLORS.border, margin: "8px 0 16px" }} />
			<EmailText muted>
				Button not working? Paste this link into your browser:
				<br />
				<Link
					href={href}
					style={{ color: EMAIL_COLORS.primary, wordBreak: "break-all" }}
				>
					{href}
				</Link>
			</EmailText>
		</>
	)
}
