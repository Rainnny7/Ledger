import { useEffect } from "react"

export const APP_NAME = "Ledger"

/** "Bank Accounts | Ledger"; just "Ledger" while the page's name isn't known yet. */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} | ${APP_NAME}` : APP_NAME
  }, [title])
}
