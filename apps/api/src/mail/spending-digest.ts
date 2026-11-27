import type { Category } from "@ledger/shared/categories"
import type { DigestProse } from "../digest/prose.ts"
import type { SpendingDigest } from "../finance/spending-digest.ts"
import { escapeHtml } from "./html.ts"

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

const COLORS = {
	text: "#111827",
	muted: "#6b7280",
	border: "#e5e7eb",
	bar: "#4f46e5",
	barTrack: "#eef0f6",
	good: "#15803d",
	bad: "#b91c1c",
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

function barRow(label: string, value: string, percent: number): string {
	const width = Math.max(2, Math.min(100, Math.round(percent)))
	return `<tr><td style="padding:6px 0 2px;font-size:14px;color:${COLORS.text}">${escapeHtml(label)}</td><td align="right" style="padding:6px 0 2px;font-size:14px;color:${COLORS.text}">${escapeHtml(value)}</td></tr>
<tr><td colspan="2" style="padding:0 0 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.barTrack};border-radius:4px"><tr><td width="${width}%" style="background:${COLORS.bar};height:8px;line-height:8px;font-size:0;border-radius:4px">&nbsp;</td><td style="font-size:0;line-height:8px">&nbsp;</td></tr></table></td></tr>`
}

function section(title: string, line: string | undefined, body: string) {
	if (!body) {
		return ""
	}
	return `<h2 style="margin:28px 0 8px;font-size:16px;color:${COLORS.text}">${escapeHtml(title)}</h2>
${line ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:${COLORS.muted}">${escapeHtml(line)}</p>` : ""}
${body}`
}

function listHtml(items: string[]): string {
	if (items.length === 0) {
		return ""
	}
	return `<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.6;color:${COLORS.text}">${items
		.map((item) => `<li>${escapeHtml(item)}</li>`)
		.join("")}</ul>`
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
export function spendingDigestMailContent(options: SpendingDigestMailOptions) {
	const { digest, prose, unsubscribeUrl, appUrl } = options
	const money = moneyFormatter(digest.currency)
	const label = monthLabel(digest.period)
	const savings =
		digest.savingsRate === null ? "n/a" : `${digest.savingsRate}%`
	const netColor = digest.net >= 0 ? COLORS.good : COLORS.bad
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

	const stat = (name: string, value: string, color = COLORS.text) =>
		`<td style="padding:0 16px 0 0;vertical-align:top"><div style="font-size:12px;color:${COLORS.muted};text-transform:uppercase;letter-spacing:.04em">${escapeHtml(name)}</div><div style="font-size:22px;font-weight:600;color:${color}">${escapeHtml(value)}</div></td>`

	const categoriesBody = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${digest.topCategories
		.map((row) =>
			barRow(
				categoryName(row.category),
				`${money(row.spent)} · ${row.share}%`,
				(row.spent / topSpent) * 100
			)
		)
		.join(
			""
		)}</table>${shifts.length > 0 ? `<div style="margin-top:10px">${listHtml(shifts)}</div>` : ""}`

	const trendBody = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${digest.trend
		.map((month) =>
			barRow(
				`${shortMonth(month.month)} spent`,
				money(month.spent),
				(month.spent / trendPeak) * 100
			)
		)
		.join("")}</table>`

	const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(spendingDigestSubject(digest.period))}</title></head>
<body style="margin:0;padding:0;background:#f6f7fb">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:12px"><tr><td style="padding:28px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:${COLORS.text}">
<p style="margin:0 0 4px;font-size:13px;color:${COLORS.muted}">Ledger · ${escapeHtml(label)}</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3">Your ${escapeHtml(label)} spending</h1>
${prose.headline ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.55">${escapeHtml(prose.headline)}</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${stat("Spent", money(digest.spent))}${stat("Income", money(digest.income))}${stat("Net", money(digest.net), netColor)}</tr></table>
<p style="margin:12px 0 0;font-size:14px;color:${COLORS.muted}">Savings rate ${escapeHtml(savings)}. ${escapeHtml(changeText(digest))}</p>
${section("Where it went", prose.spending, categoriesBody)}
${section("Last three months", prose.trend, trendBody)}
${section("Worth a look", prose.unusual, listHtml(unusual))}
${section("Recurring charges", prose.recurring, listHtml(recurring))}
${prose.suggestion ? `<div style="margin:28px 0 0;padding:14px 16px;background:${COLORS.barTrack};border-radius:8px;font-size:14px;line-height:1.55"><strong>An idea:</strong> ${escapeHtml(prose.suggestion)}</div>` : ""}
<p style="margin:28px 0 0"><a href="${escapeHtml(appUrl)}" style="color:${COLORS.bar};font-size:14px">Open Ledger</a></p>
</td></tr></table>
<p style="max-width:560px;margin:16px 0 0;font-family:system-ui,sans-serif;font-size:12px;line-height:1.5;color:${COLORS.muted}">You're getting this because you turned on the monthly digest in Ledger. <a href="${escapeHtml(unsubscribeUrl)}" style="color:${COLORS.muted}">Unsubscribe</a></p>
</td></tr></table>
</body>
</html>`
	return { subject: spendingDigestSubject(digest.period), text, html }
}
