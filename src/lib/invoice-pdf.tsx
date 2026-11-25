/**
 * Invoice PDFs, drawn in the browser with takumi-pdf (WebAssembly) from the pdfcn templates.
 * Loaded on demand: the renderer and its font only download when a PDF is first needed.
 */
import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'
import geistLatinExt from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url'
import initTakumi, { type FontLoader, render } from 'takumi-pdf/no-init'
import wasmUrl from 'takumi-pdf/takumi_pdf_wasm_bg.wasm?url'
import { InvoiceClassicDocument } from '@/components/pdf/blocks/invoice-classic/invoice-classic'
import { InvoiceMinimalDocument } from '@/components/pdf/blocks/invoice-minimal/invoice-minimal'
import { InvoiceModernDocument } from '@/components/pdf/blocks/invoice-modern/invoice-modern'
import { corporateTheme } from '@/lib/pdf-themes/corporate'
import { elegantTheme } from '@/lib/pdf-themes/elegant'
import { forestTheme } from '@/lib/pdf-themes/forest'
import { modernTheme } from '@/lib/pdf-themes/modern'
import { professionalTheme } from '@/lib/pdf-themes/professional'
import { vividTheme } from '@/lib/pdf-themes/vivid'
import { type InvoicePdfSource, toPdfData } from './invoice-pdf-data'

export type { InvoicePdfSource }

const THEMES = {
  professional: professionalTheme,
  modern: modernTheme,
  elegant: elegantTheme,
  corporate: corporateTheme,
  forest: forestTheme,
  vivid: vividTheme,
}

/** Every family the pdfcn themes name, all drawn with Geist (the app's own font). */
const FAMILIES = ['Helvetica', 'Times-Roman', 'Inter', 'Lato', 'Lora', 'Merriweather', 'Nunito', 'Playfair Display', 'Geist']

let ready: Promise<FontLoader[]> | null = null

function load() {
  ready ??= (async () => {
    const [, latin, ext] = await Promise.all([
      initTakumi({ module_or_path: wasmUrl }),
      fetch(geistLatin).then((r) => r.arrayBuffer()),
      fetch(geistLatinExt).then((r) => r.arrayBuffer()),
    ])
    // Latin-ext covers accented names (é, ł, ő…) the basic Latin file doesn't.
    return FAMILIES.flatMap((name): FontLoader[] => [
      { name, data: new Uint8Array(latin), unicodeRange: [[0x0000, 0x00ff], [0x0131, 0x0131], [0x0152, 0x0153], [0x02bb, 0x02dc], [0x2000, 0x206f], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2190, 0x2212]] },
      { name, data: new Uint8Array(ext), unicodeRange: [[0x0100, 0x024f], [0x0259, 0x0259], [0x1e00, 0x1eff], [0x20a0, 0x20cf], [0x2c60, 0x2c7f], [0xa720, 0xa7ff]] },
    ])
  })().catch((e) => {
    ready = null
    throw e
  })
  return ready
}

export async function renderInvoicePdf(source: InvoicePdfSource): Promise<Blob> {
  const fonts = await load()
  const data = toPdfData(source)
  const theme = THEMES[source.invoice.theme as keyof typeof THEMES] ?? professionalTheme
  const Doc =
    source.invoice.template === 'minimal' ? InvoiceMinimalDocument : source.invoice.template === 'classic' ? InvoiceClassicDocument : InvoiceModernDocument
  const bytes = await render(<Doc theme={theme} data={data} />, {
    size: 'a4',
    // The template draws its own page padding; a page margin would push the footer onto page 2.
    margin: 0,
    fonts,
    fontFamilies: ['Geist'],
    uncoveredText: 'placeholder',
    metadata: {
      title: `Invoice ${data.number}`,
      authors: source.invoice.from.name ? [source.invoice.from.name] : undefined,
      creator: 'Ledger',
    },
  })
  return new Blob([bytes], { type: 'application/pdf' })
}
