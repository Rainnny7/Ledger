import { createContext, useContext, useMemo, type ReactNode } from "react"
import {
	buildConverter,
	type Converter,
	useFx,
	useHomeCurrency,
} from "@/lib/currency"

const ConverterContext = createContext<Converter | null>(null)

type ConverterProviderProps = {
	children: ReactNode
}

/** One shared home-currency converter for the tree (FX + session subscriptions once). */
export function ConverterProvider({ children }: ConverterProviderProps) {
	const home = useHomeCurrency()
	const fx = useFx()
	const converter = useMemo(() => buildConverter(home, fx), [home, fx])
	return (
		<ConverterContext.Provider value={converter}>
			{children}
		</ConverterContext.Provider>
	)
}

/** Converts amounts into the home currency at today's reference rates. */
export function useConverter(): Converter {
	const converter = useContext(ConverterContext)
	if (!converter) {
		throw new Error("useConverter must be used within ConverterProvider")
	}
	return converter
}
