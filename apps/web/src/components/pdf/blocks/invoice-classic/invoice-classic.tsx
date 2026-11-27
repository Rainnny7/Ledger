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

/** pdfcn "Invoice Classic": number on the right of the header, three columns, gridded zebra table. */
const InvoiceClassicContent = ({ data }: { data: InvoicePdfData }) => {
	const theme = usePdfcnTheme()

	const styles = StyleSheet.create({
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
				<PageHeader
					variant="simple"
					title="Invoice"
					subtitle={data.from.name || undefined}
					rightText={data.number}
					rightSubText={`Due: ${data.dueDate}`}
					marginBottom={16}
				/>
				<Section
					noWrap
					spacing="none"
					style={{ flexDirection: "row", marginBottom: 16 }}
				>
					<View style={{ flex: 1, paddingRight: 15 }}>
						<PartyBlock label="From" party={data.from} />
					</View>
					<View style={{ flex: 1, paddingRight: 15 }}>
						<PartyBlock label="Bill To" party={data.client} />
					</View>
					<View style={{ flex: 1 }}>
						<SectionLabel>Details</SectionLabel>
						<Text
							noMargin
							variant="xs"
						>{`Issued ${data.issueDate}`}</Text>
						<Text
							noMargin
							variant="xs"
						>{`Due ${data.dueDate}`}</Text>
						<Text
							noMargin
							variant="xs"
							weight="bold"
						>{`Amount due ${data.amountDue}`}</Text>
					</View>
				</Section>
				<Table variant="grid" zebraStripe>
					<TableHeader>
						<TableRow header>
							<TableCell>Description</TableCell>
							<TableCell align="center">Qty</TableCell>
							<TableCell align="center">Rate</TableCell>
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
								<TableCell align="center">
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
					<View style={{ marginLeft: "auto", width: 220 }}>
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

/** `InvoiceClassicDocument` helper or constant for this feature area. */
export const InvoiceClassicDocument = ({
	theme,
	data,
}: {
	theme?: PdfcnTheme
	data: InvoicePdfData
}) => (
	<PdfcnThemeProvider theme={theme}>
		<InvoiceClassicContent data={data} />
	</PdfcnThemeProvider>
)
