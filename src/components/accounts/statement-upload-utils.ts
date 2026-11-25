export const ACCEPT = ".pdf,.zip,application/pdf,application/zip"

export const accepted = (f: File) => /\.(pdf|zip)$/i.test(f.name)

export function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
