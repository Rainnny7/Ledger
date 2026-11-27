import {
	InvoiceFooter,
	NotesAndTerms,
	PartyBlock,
	PaymentDetails,
	SectionLabel,
	Totals,
} from "@/components/pdf/blocks/invoice-shared/invoice-parts"
import type { InvoicePdfData } from "@/components/pdf/blocks/invoice-shared/invoice-data"
import { KeyValue } from "@/components/pdf/key-value/key-value"
import { PageHeader } from "@/components/pdf/page-header/page-header"
import { Section } from "@/components/pdf/section/section"
import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableRow,
} from "@/components/pdf/table/table"
import { Text } from "@/components/pdf/text/text"
import {
	PdfcnThemeProvider,
	usePdfcnTheme,
} from "@/components/pdf/theme-provider"
import { Document, Page, StyleSheet, View } from "@/lib/pdf-primitives"
import type { PdfcnTheme } from "@/types/pdf-themes"

/** pdfcn "Invoice Minimal": quiet header, outlined number stamp, compact table. */
const InvoiceMinimalContent = ({ data }: { data: InvoicePdfData }) => {
	const theme = usePdfcnTheme()

	const styles = StyleSheet.create({
		infoRow: { flexDirection: "row", marginBottom: 18 },
		invoiceStamp: {
			alignSelf: "flex-start",
			borderColor: theme.colors.primary,
			borderRadius: theme.primitives.borderRadius.sm,
			borderStyle: "solid",
			borderWidth: 2,
			paddingHorizontal: 12,
			paddingVertical: 8,
		},
		page: {
			backgroundColor: theme.colors.background,
			boxSizing: "border-box",
			minHeight: 841,
			padding: theme.spacing.page.marginTop,
			paddingBottom: theme.spacing.page.marginBottom + 24,
			position: "relative",
		},
	})

	return (
		<Document title={`Invoice ${data.number}`}>
			<Page size="A4" style={styles.page}>
				<Section
					noWrap
					style={{
						alignItems: "flex-start",
						flexDirection: "row",
						marginBottom: theme.spacing.sectionGap,
					}}
				>
					<View style={{ flex: 1, paddingRight: 16 }}>
						<PageHeader
							variant="minimal"
							title={data.from.name || "Invoice"}
							subtitle={
								data.from.lines.join("  ·  ") || undefined
							}
							marginBottom={0}
						/>
					</View>
					<View style={styles.invoiceStamp}>
						<Text
							style={{
								color: theme.colors.primary,
								fontSize: 7,
								fontWeight: "bold",
								textAlign: "right",
							}}
							noMargin
							transform="uppercase"
						>
							Invoice
						</Text>
						<Text
							style={{
								color: theme.colors.foreground,
								fontSize: 14,
								fontWeight: "bold",
								textAlign: "right",
							}}
							noMargin
						>
							{data.number}
						</Text>
						<Text
							style={{
								color: theme.colors.mutedForeground,
								fontSize: 8,
								textAlign: "right",
							}}
							noMargin
						>
							{data.issueDate}
						</Text>
					</View>
				</Section>
				<View style={styles.infoRow}>
					<View style={{ paddingRight: 20, width: "50%" }}>
						<PartyBlock
							label="Bill To"
							party={data.client}
							labelColor={theme.colors.primary}
						/>
					</View>
					<View style={{ width: "50%" }}>
						<SectionLabel color={theme.colors.primary}>
							Invoice details
						</SectionLabel>
						<KeyValue
							size="sm"
							items={[
								{ key: "Issued", value: data.issueDate },
								{ key: "Due", value: data.dueDate },
								{ key: "Amount due", value: data.amountDue },
							]}
						/>
					</View>
				</View>
				<Table variant="compact">
					<TableHeader>
						<TableRow header>
							<TableCell>Description</TableCell>
							<TableCell align="center">Qty</TableCell>
							<TableCell align="right">Rate</TableCell>
							<TableCell align="right">Total</TableCell>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.items.map((item, index) => (
							<TableRow key={index}>
								<TableCell>{item.description}</TableCell>
								<TableCell align="center">
									{item.quantity}
								</TableCell>
								<TableCell align="right">
									{item.unitPrice}
								</TableCell>
								<TableCell align="right">
									{item.amount}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
				<Section
					noWrap
					spacing="none"
					style={{ flexDirection: "row", marginTop: 12 }}
				>
					<View style={{ flex: 1 }} />
					<View style={{ width: 240 }}>
						<Totals data={data} accent={theme.colors.primary} />
					</View>
				</Section>
				<PaymentDetails data={data} />
				<NotesAndTerms data={data} />
				<InvoiceFooter data={data} />
			</Page>
		</Document>
	)
}

/** `InvoiceMinimalDocument` helper or constant for this feature area. */
export const InvoiceMinimalDocument = ({
	theme,
	data,
}: {
	theme?: PdfcnTheme
	data: InvoicePdfData
}) => (
	<PdfcnThemeProvider theme={theme}>
		<InvoiceMinimalContent data={data} />
	</PdfcnThemeProvider>
)
