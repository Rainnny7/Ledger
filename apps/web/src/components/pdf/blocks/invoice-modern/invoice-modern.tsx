import {
	InvoiceFooter,
	NotesAndTerms,
	PartyBlock,
	PaymentDetails,
	SectionLabel,
	Totals,
} from "@/components/pdf/blocks/invoice-shared/invoice-parts"
import type { InvoicePdfData } from "@/components/pdf/blocks/invoice-shared/invoice-data"
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

/** pdfcn "Invoice Modern": branded header band, meta row, primary-header table. */
const InvoiceModernContent = ({ data }: { data: InvoicePdfData }) => {
	const theme = usePdfcnTheme()

	const styles = StyleSheet.create({
		dividerCol: {
			backgroundColor: theme.colors.border,
			marginRight: 12,
			width: 1,
		},
		metaCol: { flex: 1, paddingRight: 12 },
		metaRow: { flexDirection: "row", marginBottom: 18 },
		metaValue: { color: theme.colors.foreground, fontSize: 9 },
		page: {
			backgroundColor: theme.colors.background,
			boxSizing: "border-box",
			minHeight: 841,
			padding: theme.spacing.page.marginTop,
			paddingBottom: theme.spacing.page.marginBottom + 24,
			position: "relative",
		},
	})

	const subtitle = [data.from.lines.join("  ·  ")].filter(Boolean).join("")

	return (
		<Document title={`Invoice ${data.number}`}>
			<Page size="A4" style={styles.page}>
				<PageHeader
					variant="branded"
					title={data.from.name || "Invoice"}
					subtitle={subtitle || undefined}
					marginBottom={18}
				/>
				<View style={styles.metaRow}>
					<View style={styles.metaCol}>
						<SectionLabel>Invoice</SectionLabel>
						<Text
							style={{
								...styles.metaValue,
								fontSize: 11,
								fontWeight: "bold",
							}}
							noMargin
						>
							{data.number}
						</Text>
					</View>
					<View style={styles.metaCol}>
						<SectionLabel>Issued</SectionLabel>
						<Text style={styles.metaValue} noMargin>
							{data.issueDate}
						</Text>
					</View>
					<View style={styles.metaCol}>
						<SectionLabel>Due</SectionLabel>
						<Text style={styles.metaValue} noMargin>
							{data.dueDate}
						</Text>
					</View>
					<View style={styles.dividerCol} />
					<View style={{ flex: 2 }}>
						<PartyBlock label="Billed To" party={data.client} />
					</View>
				</View>
				<Table variant="primary-header">
					<TableHeader>
						<TableRow header>
							<TableCell>Description</TableCell>
							<TableCell align="center">Qty</TableCell>
							<TableCell align="right">Unit Price</TableCell>
							<TableCell align="right">Amount</TableCell>
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
					<View style={{ flex: 1, paddingRight: 20 }}>
						<SectionLabel>Amount Due</SectionLabel>
						<Text
							noMargin
							style={{
								color: theme.colors.foreground,
								fontSize: 20,
								fontWeight: "bold",
							}}
						>
							{data.amountDue}
						</Text>
						<Text noMargin variant="xs" color="mutedForeground">
							{`Due ${data.dueDate === "On receipt" ? "on receipt" : data.dueDate}`}
						</Text>
					</View>
					<View style={{ width: 220 }}>
						<Totals data={data} />
					</View>
				</Section>
				<PaymentDetails data={data} />
				<NotesAndTerms data={data} />
				<InvoiceFooter data={data} />
			</Page>
		</Document>
	)
}

/** `InvoiceModernDocument` helper or constant for this feature area. */
export const InvoiceModernDocument = ({
	theme,
	data,
}: {
	theme?: PdfcnTheme
	data: InvoicePdfData
}) => (
	<PdfcnThemeProvider theme={theme}>
		<InvoiceModernContent data={data} />
	</PdfcnThemeProvider>
)
