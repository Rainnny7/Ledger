import { useQuery } from "@tanstack/react-query"
import { adminFetch } from "@/lib/admin"
import { type AdminSettings, settingsKey } from "@/components/admin/admin-types"

export const useAdminSettings = () =>
  useQuery({
    queryKey: settingsKey,
    queryFn: () => adminFetch<AdminSettings>("settings"),
  })
