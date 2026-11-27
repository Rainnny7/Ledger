import {
	SavedIndicator,
	useSavedFlash,
} from "@/components/common/saved-indicator"
import {
	ACCENTS,
	MODES,
	type AccentId,
	type ModeChoice,
	useAppTheme,
} from "@/lib/theme"
import { cn } from "cn"

/** A miniature of the app: page, a card with a few lines, and an accent button. */
export function ModePreview({
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

const MODE_OPTIONS: {
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

/** Mode picker grid shared by Settings and onboarding. */
export function AppearanceModePicker() {
	const { mode, accent, changeMode } = useAppTheme()
	const { saved, flash } = useSavedFlash()
	const lightMode = MODES.find((entry) => entry.id === "light")!
	const darkMode = MODES.find((entry) => entry.id === "dark")!
	const accentEntry = ACCENTS.find((entry) => entry.id === accent)!
	const accentFor = (dark: boolean) =>
		dark ? accentEntry.dark : accentEntry.light

	return (
		<div className="grid gap-3">
			<h3 className="flex items-center gap-2 text-sm font-medium">
				Mode
				<SavedIndicator saved={saved} />
			</h3>
			<div
				role="radiogroup"
				aria-label="Mode"
				className="grid grid-cols-2 gap-3 lg:grid-cols-4"
			>
				{MODE_OPTIONS.map((option) => {
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
							onClick={(event) => {
								void changeMode(
									option.id,
									event.currentTarget
								).then((ok) => {
									if (ok) {
										flash()
									}
								})
							}}
							className={cn(
								"grid content-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
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
							<span className="px-0.5">
								<span className="grid gap-0.5">
									<span className="text-sm font-medium">
										{option.label}
									</span>
									<span className="text-xs leading-snug text-muted-foreground">
										{option.description}
									</span>
								</span>
							</span>
						</button>
					)
				})}
			</div>
		</div>
	)
}

/** Accent colour picker shared by Settings and onboarding. */
export function AppearanceAccentPicker() {
	const { accent, changeAccent } = useAppTheme()
	const { saved, flash } = useSavedFlash()

	return (
		<div className="grid gap-3">
			<h3 className="flex items-center gap-2 text-sm font-medium">
				Accent
				<SavedIndicator saved={saved} />
			</h3>
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
							onClick={(event) => {
								void changeAccent(
									entry.id as AccentId,
									event.currentTarget
								).then((ok) => {
									if (ok) {
										flash()
									}
								})
							}}
							className={cn(
								"relative grid size-9 place-items-center rounded-full ring-1 ring-foreground/15 transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
								selected &&
									"ring-2 ring-foreground/70 ring-offset-2 ring-offset-card"
							)}
							style={{
								background: `linear-gradient(135deg, ${entry.light} 50%, ${entry.dark} 50%)`,
							}}
						>
						</button>
					)
				})}
			</div>
		</div>
	)
}
