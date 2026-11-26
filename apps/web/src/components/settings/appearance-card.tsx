import { Check, Monitor } from "lucide-react"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { demoMode } from "@/lib/demo"
import {
	ACCENTS,
	MODES,
	type AccentId,
	type ModeChoice,
	useAppTheme,
} from "@/lib/theme"
import { cn } from "cn"

/** A miniature of the app: page, a card with a few lines, and an accent button. */
function ModePreview({
	page,
	card,
	accent,
}: {
	page: string
	card: string
	accent: string
}) {
	return (
		<span
			aria-hidden
			className="grid h-16 grid-cols-[1fr_2fr] gap-1.5 rounded-md p-1.5 ring-1 ring-black/10"
			style={{ background: page }}
		>
			<span
				className="rounded-sm opacity-80"
				style={{ background: card }}
			/>
			<span
				className="flex flex-col gap-1 rounded-sm p-1.5"
				style={{ background: card }}
			>
				<span
					className="h-1.5 w-3/4 rounded-full opacity-40"
					style={{ background: accent }}
				/>
				<span
					className="h-1.5 w-1/2 rounded-full opacity-25"
					style={{ background: accent }}
				/>
				<span
					className="mt-auto h-2.5 w-8 rounded-sm"
					style={{ background: accent }}
				/>
			</span>
		</span>
	)
}

/** Mode and accent pickers, saved to the account (or the browser in demo mode). */
export function AppearanceCard() {
	const { mode, accent, changeMode, changeAccent } = useAppTheme()
	const lightMode = MODES.find((entry) => entry.id === "light")!
	const darkMode = MODES.find((entry) => entry.id === "dark")!
	const accentEntry = ACCENTS.find((entry) => entry.id === accent)!
	/** The picked accent, in the shade the given mode uses. */
	const accentFor = (dark: boolean) =>
		dark ? accentEntry.dark : accentEntry.light

	const options: {
		id: ModeChoice
		label: string
		description: string
	}[] = [
		{
			id: "system",
			label: "System",
			description: "Light or Dark, following your device",
		},
		...MODES.map((entry) => ({
			id: entry.id,
			label: entry.label,
			description: entry.description,
		})),
	]

	return (
		<Card>
			<CardHeader>
				<CardTitle>Appearance</CardTitle>
				<CardDescription>
					{demoMode
						? "Pick a mode and an accent colour. In demo mode they’re kept in this browser only."
						: "Pick a mode and an accent colour. They’re saved to your account, so they follow you to every device."}
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-6">
				<div className="grid gap-3">
					<h3 className="text-sm font-medium">Mode</h3>
					<div
						role="radiogroup"
						aria-label="Mode"
						className="grid grid-cols-2 gap-3 lg:grid-cols-4"
					>
						{options.map((option) => {
							const selected = mode === option.id
							const entry = MODES.find(
								(candidate) => candidate.id === option.id
							)
							return (
								<button
									key={option.id}
									type="button"
									role="radio"
									aria-checked={selected}
									onClick={(event) =>
										changeMode(
											option.id,
											event.currentTarget
										)
									}
									className={cn(
										"grid gap-2.5 rounded-xl border p-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
										selected &&
											"border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/10"
									)}
								>
									{entry ? (
										<ModePreview
											page={entry.swatch[0]}
											card={entry.swatch[1]}
											accent={accentFor(entry.dark)}
										/>
									) : (
										<span className="relative grid">
											<ModePreview
												page={lightMode.swatch[0]}
												card={lightMode.swatch[1]}
												accent={accentFor(false)}
											/>
											<span className="absolute inset-0 grid [clip-path:inset(0_0_0_50%)]">
												<ModePreview
													page={darkMode.swatch[0]}
													card={darkMode.swatch[1]}
													accent={accentFor(true)}
												/>
											</span>
										</span>
									)}
									<span className="flex items-start gap-2 px-0.5">
										<span className="grid min-w-0 flex-1 gap-0.5">
											<span className="flex items-center gap-1.5 text-sm font-medium">
												{!entry && (
													<Monitor className="size-3.5 text-muted-foreground" />
												)}
												{option.label}
											</span>
											<span className="text-xs leading-snug text-muted-foreground">
												{option.description}
											</span>
										</span>
										<Check
											className={cn(
												"mt-0.5 size-4 shrink-0 text-primary",
												!selected && "invisible"
											)}
										/>
									</span>
								</button>
							)
						})}
					</div>
				</div>

				<div className="grid gap-3">
					<h3 className="text-sm font-medium">Accent</h3>
					<div
						role="radiogroup"
						aria-label="Accent colour"
						className="flex flex-wrap gap-3"
					>
						{ACCENTS.map((entry) => {
							const selected = accent === entry.id
							return (
								<button
									key={entry.id}
									type="button"
									role="radio"
									aria-checked={selected}
									aria-label={entry.label}
									title={entry.label}
									onClick={(event) =>
										changeAccent(
											entry.id as AccentId,
											event.currentTarget
										)
									}
									className={cn(
										"relative grid size-9 place-items-center rounded-full ring-1 ring-foreground/15 transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
										selected &&
											"ring-2 ring-foreground/70 ring-offset-2 ring-offset-card"
									)}
									style={{
										background: `linear-gradient(135deg, ${entry.light} 50%, ${entry.dark} 50%)`,
									}}
								>
									<Check
										className={cn(
											"size-4 text-white mix-blend-difference",
											!selected && "hidden"
										)}
									/>
								</button>
							)
						})}
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
