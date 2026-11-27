import type { Category } from "@ledger/shared/categories"
import type { DigestProse } from "../digest/prose.ts"
import type { SpendingDigest } from "../finance/spending-digest.ts"
import { Link } from "@react-email/components"
import type { ReactElement, ReactNode } from "react"
import { EmailLayout, EmailText } from "./email-layout.tsx"
import { renderEmailHtml } from "./render.ts"
import { EMAIL_COLORS } from "./theme.ts"

/** Inputs for {@link spendingDigestMailContent}. */
export interface SpendingDigestMailOptions {
	digest: SpendingDigest
	/** The AI's wording; empty when the AI call failed. */
	prose: DigestProse
	/** Link that turns the digest off, shown in the footer. */
	unsubscribeUrl: string
	/** Where "Open Ledger" points. */
	appUrl: string
}

function monthLabel(period: string): string {
	const [year, month] = period.split("-").map(Number)
	return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	})
}

function shortMonth(period: string): string {
	const [year, month] = period.split("-").map(Number)
	return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
		month: "short",
		timeZone: "UTC",
	})
}

function categoryName(category: Category): string {
	return category.charAt(0).toUpperCase() + category.slice(1)
}

function moneyFormatter(currency: string) {
	const formatter = new Intl.NumberFormat("en-CA", {
		style: "currency",
		currency,
		maximumFractionDigits: 0,
	})
	return (amount: number) => formatter.format(amount)
}

/** Subject line for a month's digest. */
export function spendingDigestSubject(period: string): string {
	return `Your ${monthLabel(period)} spending digest`
}

function BarRow({
	label,
	value,
	percent,
}: {
	label: string
	value: string
	percent: number
}): ReactElement {
	const width = Math.max(2, Math.min(100, Math.round(percent)))
	return (
		<table
			role="presentation"
			width="100%"
			cellPadding={0}
			cellSpacing={0}
			style={{ marginBottom: "10px" }}
		>
			<tbody>
				<tr>
					<td
						style={{
							padding: "0 0 4px",
							fontSize: "14px",
							color: EMAIL_COLORS.text,
						}}
					>
						{label}
					</td>
					<td
						align="right"
						style={{
							padding: "0 0 4px",
							fontSize: "14px",
							color: EMAIL_COLORS.text,
						}}
					>
						{value}
					</td>
				</tr>
				<tr>
					<td colSpan={2}>
						<table
							role="presentation"
							width="100%"
							cellPadding={0}
							cellSpacing={0}
							style={{
								backgroundColor: EMAIL_COLORS.track,
								borderRadius: "4px",
							}}
						>
							<tbody>
								<tr>
									<td
										width={`${width}%`}
										style={{
											backgroundColor:
												EMAIL_COLORS.primary,
											height: "8px",
											lineHeight: "8px",
											fontSize: 0,
											borderRadius: "4px",
										}}
									>
										&nbsp;
									</td>
									<td
										style={{
											fontSize: 0,
											lineHeight: "8px",
										}}
									>
										&nbsp;
									</td>
								</tr>
							</tbody>
						</table>
					</td>
				</tr>
			</tbody>
		</table>
	)
}

function Section({
	title,
	line,
	children,
}: {
	title: string
	line?: string
	children: ReactNode
}): ReactElement {
	return (
		<>
			<h2
				style={{
					margin: "28px 0 8px",
					fontSize: "16px",
					color: EMAIL_COLORS.text,
				}}
			>
				{title}
			</h2>
			{line ? <EmailText muted>{line}</EmailText> : null}
			{children}
		</>
	)
}

function BulletList({ items }: { items: string[] }): ReactElement {
	return (
		<ul
			style={{
				margin: "0",
				paddingLeft: "20px",
				fontSize: "14px",
				lineHeight: "1.6",
				color: EMAIL_COLORS.text,
			}}
		>
			{items.map((item) => (
				<li key={item}>{item}</li>
			))}
		</ul>
	)
}

function Stat({
	name,
	value,
	color = EMAIL_COLORS.text,
}: {
	name: string
	value: string
	color?: string
}): ReactElement {
	return (
		<td style={{ padding: "0 20px 0 0", verticalAlign: "top" }}>
			<div
				style={{
					fontSize: "12px",
					color: EMAIL_COLORS.muted,
					textTransform: "uppercase",
					letterSpacing: ".04em",
				}}
			>
				{name}
			</div>
			<div style={{ fontSize: "22px", fontWeight: 600, color }}>
				{value}
			</div>
		</td>
	)
}

/** The unusual-item bullets as plain sentences (shared by the HTML and text bodies). */
function unusualLines(digest: SpendingDigest, money: (n: number) => string) {
	return [
		...digest.unusual.newMerchants.map(
			(entry) => `New merchant: ${entry.merchant}, ${money(entry.amount)}`
		),
		...digest.unusual.largeOneOffs.map(
			(entry) =>
				`Large one-off: ${entry.merchant}, ${money(entry.amount)} on ${entry.date}`
		),
		...digest.unusual.possibleDuplicates.map(
			(entry) =>
				`Possible duplicate: ${entry.merchant}, ${money(entry.amount)} charged ${entry.count} times on ${entry.date}`
		),
	]
}

function recurringLines(digest: SpendingDigest, money: (n: number) => string) {
	return [
		...digest.recurring.newCharges.map(
			(entry) =>
				`New recurring charge: ${entry.name}, ${money(entry.amount)} (${entry.cycle})`
		),
		...digest.recurring.priceIncreases.map(
			(entry) =>
				`Price increase: ${entry.name} went from ${money(entry.from)} to ${money(entry.to)} (${entry.cycle})`
		),
	]
}

function shiftLines(digest: SpendingDigest, money: (n: number) => string) {
	return digest.categoryShifts.map((shift) => {
		const direction = shift.change > 0 ? "up" : "down"
		return `${categoryName(shift.category)}: ${money(shift.spent)}, ${direction} ${money(Math.abs(shift.change))} from your usual ${money(shift.average)}`
	})
}

function changeText(digest: SpendingDigest): string {
	const percent = digest.previousMonth.spentChangePercent
	if (percent === null) {
		return "No spending to compare with the month before."
	}
	if (percent === 0) {
		return "About the same as the month before."
	}
	return `${Math.abs(percent)}% ${percent > 0 ? "more" : "less"} than the month before.`
}

/**
 * Plain-text and HTML bodies for the monthly spending digest. Every figure comes from `digest`;
 * `prose` only supplies the surrounding sentences. The HTML uses table-and-inline-CSS bars so it
 * renders in mail clients without images or scripts.
 */
export async function spendingDigestMailContent(
	options: SpendingDigestMailOptions
) {
	const { digest, prose, unsubscribeUrl, appUrl } = options
	const money = moneyFormatter(digest.currency)
	const label = monthLabel(digest.period)
	const savings =
		digest.savingsRate === null ? "n/a" : `${digest.savingsRate}%`
	const netColor = digest.net >= 0 ? EMAIL_COLORS.good : EMAIL_COLORS.bad
	const unusual = unusualLines(digest, money)
	const recurring = recurringLines(digest, money)
	const shifts = shiftLines(digest, money)
	const topSpent = Math.max(
		1,
		...digest.topCategories.map((row) => row.spent)
	)
	const trendPeak = Math.max(
		1,
		...digest.trend.flatMap((month) => [month.spent, month.income])
	)

	const text = [
		`Your ${label} spending digest`,
		"",
		...(prose.headline ? [prose.headline, ""] : []),
		`Spent: ${money(digest.spent)}`,
		`Income: ${money(digest.income)}`,
		`Net: ${money(digest.net)} (savings rate ${savings})`,
		changeText(digest),
		"",
		"Where it went",
		...(prose.spending ? [prose.spending] : []),
		...digest.topCategories.map(
			(row) =>
				`- ${categoryName(row.category)}: ${money(row.spent)} (${row.share}%)`
		),
		...shifts.map((line) => `- ${line}`),
		"",
		"Last three months",
		...(prose.trend ? [prose.trend] : []),
		...digest.trend.map(
			(month) =>
				`- ${shortMonth(month.month)}: spent ${money(month.spent)}, income ${money(month.income)}`
		),
		...(unusual.length > 0
			? [
					"",
					"Worth a look",
					...(prose.unusual ? [prose.unusual] : []),
					...unusual.map((line) => `- ${line}`),
				]
			: []),
		...(recurring.length > 0
			? [
					"",
					"Recurring charges",
					...(prose.recurring ? [prose.recurring] : []),
					...recurring.map((line) => `- ${line}`),
				]
			: []),
		...(prose.suggestion ? ["", `An idea: ${prose.suggestion}`] : []),
		"",
		`Open Ledger: ${appUrl}`,
		"",
		"You're getting this because you turned on the monthly digest in Ledger.",
		`Unsubscribe: ${unsubscribeUrl}`,
	].join("\n")

	const html = await renderEmailHtml(
		<EmailLayout
			preview={prose.headline ?? `Your ${label} spending at a glance`}
			title={`Your ${label} spending`}
			footer={
				<>
					You're getting this because you turned on the monthly digest
					in Ledger.{" "}
					<Link
						href={unsubscribeUrl}
						style={{ color: EMAIL_COLORS.muted }}
					>
						Unsubscribe
					</Link>
				</>
			}
		>
			{prose.headline ? <EmailText>{prose.headline}</EmailText> : null}
			<table role="presentation" cellPadding={0} cellSpacing={0}>
				<tbody>
					<tr>
						<Stat name="Spent" value={money(digest.spent)} />
						<Stat name="Income" value={money(digest.income)} />
						<Stat
							name="Net"
							value={money(digest.net)}
							color={netColor}
						/>
					</tr>
				</tbody>
			</table>
			<EmailText muted>
				Savings rate {savings}. {changeText(digest)}
			</EmailText>
			{digest.topCategories.length > 0 ? (
				<Section title="Where it went" line={prose.spending}>
					{digest.topCategories.map((row) => (
						<BarRow
							key={row.category}
							label={categoryName(row.category)}
							value={`${money(row.spent)} · ${row.share}%`}
							percent={(row.spent / topSpent) * 100}
						/>
					))}
					{shifts.length > 0 ? <BulletList items={shifts} /> : null}
				</Section>
			) : null}
			{digest.trend.length > 0 ? (
				<Section title="Last three months" line={prose.trend}>
					{digest.trend.map((month) => (
						<BarRow
							key={month.month}
							label={`${shortMonth(month.month)} spent`}
							value={money(month.spent)}
							percent={(month.spent / trendPeak) * 100}
						/>
					))}
				</Section>
			) : null}
			{unusual.length > 0 ? (
				<Section title="Worth a look" line={prose.unusual}>
					<BulletList items={unusual} />
				</Section>
			) : null}
			{recurring.length > 0 ? (
				<Section title="Recurring charges" line={prose.recurring}>
					<BulletList items={recurring} />
				</Section>
			) : null}
			{prose.suggestion ? (
				<div
					style={{
						margin: "28px 0 0",
						padding: "14px 16px",
						backgroundColor: EMAIL_COLORS.tint,
						borderRadius: "10px",
						fontSize: "14px",
						lineHeight: "1.55",
						color: EMAIL_COLORS.text,
					}}
				>
					<strong>An idea:</strong> {prose.suggestion}
				</div>
			) : null}
			<p style={{ margin: "28px 0 0" }}>
				<Link
					href={appUrl}
					style={{
						color: EMAIL_COLORS.primary,
						fontSize: "14px",
						fontWeight: 600,
					}}
				>
					Open Ledger
				</Link>
			</p>
		</EmailLayout>
	)
	return { subject: spendingDigestSubject(digest.period), text, html }
}
