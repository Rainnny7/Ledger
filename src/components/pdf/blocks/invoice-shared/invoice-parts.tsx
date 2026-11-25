import type { ReactNode } from "react"
/** Pieces every invoice template shares: how to pay, notes/terms, the stamp and the footer. */
import { PageNumber, TotalPages } from "takumi-pdf/primitives"
import { KeyValue } from "@/components/pdf/key-value/key-value"
import { PageFooter } from "@/components/pdf/page-footer/page-footer"
import { PdfQRCode } from "@/components/pdf/qrcode/qrcode"
import { Text } from "@/components/pdf/text/text"
import { usePdfcnTheme } from "@/components/pdf/theme-provider"
import { Text as PdfText, View } from "@/lib/pdf-primitives"
import type { InvoicePdfData, InvoicePdfMethod } from "./invoice-data"

/** React/UI entry: `SectionLabel`. */
export function SectionLabel({
	children,
	color,
}: {
	children: string
	color?: string
}) {
	const theme = usePdfcnTheme()
	return (
		<Text
			noMargin
			style={{
				color: color ?? theme.colors.mutedForeground,
				fontSize: 8,
				fontWeight: "bold",
				letterSpacing: 0.6,
				marginBottom: 4,
				textTransform: "uppercase",
			}}
		>
			{children}
		</Text>
	)
}

/** React/UI entry: `PartyBlock`. */
export function PartyBlock({
	label,
	party,
	labelColor,
}: {
	label: string
	party: InvoicePdfData["client"]
	labelColor?: string
}) {
	const theme = usePdfcnTheme()
	return (
		<View>
			<SectionLabel color={labelColor}>{label}</SectionLabel>
			<Text
				noMargin
				style={{
					color: theme.colors.foreground,
					fontSize: 10,
					fontWeight: "bold",
				}}
			>
				{party.name || "—"}
			</Text>
			{party.lines.map((line, i) => (
				<Text
					key={i}
					noMargin
					style={{ color: theme.colors.mutedForeground, fontSize: 9 }}
				>
					{line}
				</Text>
			))}
		</View>
	)
}

/** React/UI entry: `Totals`. */
export function Totals({
	data,
	accent,
}: {
	data: InvoicePdfData
	accent?: string
}) {
	const theme = usePdfcnTheme()
	return (
		<View>
			<KeyValue
				size="sm"
				dividerThickness={1}
				divided
				items={data.totals.map((total) =>
					total.strong
						? {
								key: total.label,
								value: total.value,
								keyStyle: { fontSize: 11, fontWeight: "bold" },
								valueStyle: {
									color: accent ?? theme.colors.foreground,
									fontSize: 12,
									fontWeight: "bold",
								},
							}
						: { key: total.label, value: total.value }
				)}
			/>
			{data.stamp && <Stamp label={data.stamp} />}
		</View>
	)
}

function Stamp({ label }: { label: "PAID" | "VOID" }) {
	const theme = usePdfcnTheme()
	const color =
		label === "PAID" ? theme.colors.success : theme.colors.destructive
	return (
		<View
			style={{
				alignSelf: "flex-end",
				borderColor: color,
				borderRadius: 4,
				borderStyle: "solid",
				borderWidth: 2,
				marginTop: 10,
				paddingHorizontal: 10,
				paddingVertical: 3,
			}}
		>
			<Text
				noMargin
				style={{
					color,
					fontSize: 12,
					fontWeight: "bold",
					letterSpacing: 2,
				}}
			>
				{label}
			</Text>
		</View>
	)
}

function Card({ children }: { children: ReactNode }) {
	const theme = usePdfcnTheme()
	return (
		<View
			wrap={false}
			style={{
				borderColor: theme.colors.border,
				borderRadius: 4,
				borderStyle: "solid",
				borderWidth: 1,
				marginBottom: 6,
				padding: 7,
				width: "32%",
			}}
		>
			{children}
		</View>
	)
}

function MethodCard({ method }: { method: InvoicePdfMethod }) {
	const theme = usePdfcnTheme()
	return (
		<Card>
			<View style={{ flexDirection: "row" }}>
				<View style={{ flex: 1 }}>
					<Text
						noMargin
						style={{
							color: theme.colors.foreground,
							fontSize: 9,
							fontWeight: "bold",
							marginBottom: 2,
						}}
					>
						{method.label}
					</Text>
					{method.lines.map((line, index) => (
						<Text
							key={index}
							noMargin
							style={{
								color: theme.colors.foreground,
								fontSize: 7.5,
								lineHeight: 1.4,
								wordBreak: "break-all",
							}}
						>
							<PdfText
								style={{ color: theme.colors.mutedForeground }}
							>{`${line.label}: `}</PdfText>
							{line.value}
						</Text>
					))}
					{method.link && (
						<PdfText
							href={method.link}
							style={{
								color: theme.colors.accent,
								fontSize: 7.5,
								lineHeight: 1.4,
								textDecoration: "none",
								wordBreak: "break-all",
							}}
						>
							{method.link.replace(/^https:\/\//, "")}
						</PdfText>
					)}
				</View>
				{method.qr && (
					<PdfQRCode
						value={method.qr}
						size={44}
						margin={1}
						style={{ marginLeft: 5 }}
					/>
				)}
			</View>
		</Card>
	)
}

/** How to pay: a "scan to pay online" card, then each payment method you offered. */
export function PaymentDetails({ data }: { data: InvoicePdfData }) {
	const theme = usePdfcnTheme()
	const online = data.payUrl && !data.stamp
	if (!data.methods.length && !online) {
		return null
	}
	return (
		<View style={{ marginTop: 16 }}>
			<SectionLabel>How to pay</SectionLabel>
			<View
				style={{ columnGap: 6, flexDirection: "row", flexWrap: "wrap" }}
			>
				{online && (
					<Card>
						<View
							style={{
								alignItems: "center",
								flexDirection: "row",
							}}
						>
							<PdfQRCode
								value={data.payUrl!}
								size={44}
								margin={1}
							/>
							<View style={{ flex: 1, paddingLeft: 7 }}>
								<Text
									noMargin
									style={{
										color: theme.colors.foreground,
										fontSize: 9,
										fontWeight: "bold",
										marginBottom: 2,
									}}
								>
									Pay online
								</Text>
								<PdfText
									href={data.payUrl!}
									style={{
										color: theme.colors.mutedForeground,
										fontSize: 7.5,
										lineHeight: 1.4,
										textDecoration: "none",
									}}
								>
									Scan or open the invoice link to see every
									way to pay.
								</PdfText>
							</View>
						</View>
					</Card>
				)}
				{data.methods.map((method, index) => (
					<MethodCard key={index} method={method} />
				))}
			</View>
		</View>
	)
}

/** React/UI entry: `NotesAndTerms`. */
export function NotesAndTerms({ data }: { data: InvoicePdfData }) {
	const theme = usePdfcnTheme()
	if (!data.notes && !data.terms) {
		return null
	}
	const block = (label: string, body: string) => (
		<View style={{ flex: 1, paddingRight: 16 }}>
			<SectionLabel>{label}</SectionLabel>
			<Text
				noMargin
				style={{
					color: theme.colors.foreground,
					fontSize: 9,
					lineHeight: 1.5,
					whiteSpace: "pre-wrap",
				}}
			>
				{body}
			</Text>
		</View>
	)
	return (
		<View wrap={false} style={{ flexDirection: "row", marginTop: 10 }}>
			{data.notes && block("Notes", data.notes)}
			{data.terms && block("Terms", data.terms)}
		</View>
	)
}

/** React/UI entry: `InvoiceFooter`. */
export function InvoiceFooter({ data }: { data: InvoicePdfData }) {
	const theme = usePdfcnTheme()
	return (
		<PageFooter
			leftText={[data.from.name, `Invoice ${data.number}`]
				.filter(Boolean)
				.join("  ·  ")}
			rightText={
				<>
					Page <PageNumber /> of <TotalPages />
				</>
			}
			sticky
			pagePadding={theme.spacing.page.marginLeft}
		/>
	)
}
