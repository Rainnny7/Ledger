import { encode } from "uqr";

import {
  usePdfcnTheme,
  useSafeMemo,
} from "@/components/pdf/theme-provider";
import {
  View,
  Text as PDFText,
  StyleSheet,
} from "@/lib/pdf-primitives";
import type { Style } from "@/lib/pdf-primitives";
import { Rect, Svg } from "@/lib/pdf-svg";
import { resolveColor } from "@/lib/resolve-color";
import type { PDFComponentProps } from "@/types/pdf-components";
import type { PdfcnTheme } from "@/types/pdf-themes";

export type QRCodeErrorLevel = "L" | "M" | "Q" | "H";

/**
 * QR code rendered as an SVG grid for use in PDF documents.
 * Props - `value` | `size` | `color` | `backgroundColor` | `errorLevel` | `margin` | `caption` | `style`
 * @see {@link PdfQRCodeProps}
 */
export interface PdfQRCodeProps extends Omit<PDFComponentProps, "children"> {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  errorLevel?: QRCodeErrorLevel;
  margin?: number;
  caption?: string;
  children?: never;
}

const createQRCodeStyles = (t: PdfcnTheme) => {
  const { spacing } = t.primitives;
  return StyleSheet.create({
    caption: {
      color: t.colors.mutedForeground,
      fontFamily: t.typography.body.fontFamily,
      fontSize: t.primitives.typography.xs,
      marginTop: spacing[1],
      textAlign: "center",
    },
    container: { alignItems: "center" },
  });
};

// uqr is already the app's QR encoder (2FA setup), so the PDF uses it too instead of `qrcode`.
const generateQRMatrix = (
  value: string,
  errorLevel: QRCodeErrorLevel,
  margin: number
): boolean[][] => encode(value, { ecc: errorLevel, border: margin }).data;

export const PdfQRCode = ({
  value,
  size = 100,
  color = "#000000",
  backgroundColor = "#ffffff",
  errorLevel = "M",
  margin = 2,
  caption,
  style,
}: PdfQRCodeProps) => {
  const theme = usePdfcnTheme();
  const styles = useSafeMemo(() => createQRCodeStyles(theme), [theme]);
  const matrix = useSafeMemo(
    () => generateQRMatrix(value, errorLevel, margin),
    [value, errorLevel, margin]
  );
  const moduleSize = size / matrix.length;
  const resolvedColor = resolveColor(color, theme.colors);
  const resolvedBgColor =
    backgroundColor === "transparent"
      ? undefined
      : resolveColor(backgroundColor, theme.colors);
  const containerStyles: Style[] = [styles.container];
  if (style) {
    containerStyles.push(...[style].flat());
  }

  return (
    <View style={containerStyles}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {resolvedBgColor !== undefined && (
          <Rect x={0} y={0} width={size} height={size} fill={resolvedBgColor} />
        )}
        {matrix
          .flatMap((row, y) =>
            row
              .map((isDark, x) => (isDark ? { x, y } : null))
              .filter((pos): pos is { x: number; y: number } => pos !== null)
          )
          .map((pos) => (
            <Rect
              key={`qr-${pos.y}-${pos.x}`}
              x={pos.x * moduleSize}
              y={pos.y * moduleSize}
              width={moduleSize}
              height={moduleSize}
              fill={resolvedColor}
            />
          ))}
      </Svg>
      {caption && <PDFText style={styles.caption}>{caption}</PDFText>}
    </View>
  );
};
