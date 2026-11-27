import { render } from "@react-email/render"
import type { ReactElement } from "react"

/** Renders a React Email element to an HTML document string. */
export function renderEmailHtml(element: ReactElement): Promise<string> {
	return render(element)
}
