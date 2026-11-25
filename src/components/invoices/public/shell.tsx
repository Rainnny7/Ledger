import { BrandMark } from "@/components/layout/brand"

export function PublicInvoiceShell({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh bg-muted/40">
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8 sm:py-12">
        {children}
      </main>
      <footer className="flex items-center justify-center gap-2 pb-8 text-xs text-muted-foreground">
        <BrandMark className="size-5 rounded-md [&_svg]:size-3" /> Sent with
        Ledger
      </footer>
    </div>
  )
}
