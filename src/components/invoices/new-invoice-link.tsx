import { Plus } from "lucide-react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"

export function NewInvoiceLink({
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      render={<Link to="/invoices/new" />}
      nativeButton={false}
      {...props}
    >
      <Plus /> {children}
    </Button>
  )
}
