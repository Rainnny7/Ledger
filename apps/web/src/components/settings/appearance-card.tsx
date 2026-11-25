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
	THEMES,
	type ThemeChoice,
	type ThemeId,
	useAppTheme,
} from "@/lib/theme"
import { cn } from "cn"

/** A miniature of the app in a theme: page, a card with a few lines, and an accent button. */
function ThemePreview({
	swatch,
}: {
	swatch: readonly [string, string, string]
}) {
	const [page, card, accent] = swatch
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

const swatchOf = (id: ThemeId) =>
	(THEMES.find((theme) => theme.id === id) ?? THEMES[0]).swatch
const LIGHT_SWATCH = swatchOf("light")
const DARK_SWATCH = swatchOf("dark")

/** Theme picker, saved to the account (or the browser in demo mode). */
export function AppearanceCard() {
	const { choice, change } = useAppTheme()
	const options: {
		id: ThemeChoice
		label: string
		description: string
		swatch?: readonly [string, string, string]
	}[] = [
		{
			id: "system",
			label: "Match system",
			description: "Light or Sunset, following your device",
		},
		...THEMES.map((theme) => ({
			id: theme.id,
			label: theme.label,
			description: theme.description,
			swatch: theme.swatch,
		})),
	]

	return (
		<Card>
			<CardHeader>
				<CardTitle>Appearance</CardTitle>
				<CardDescription>
					{demoMode
						? "Pick a theme. In demo mode it’s kept in this browser only."
						: "Pick a theme. It’s saved to your account, so it follows you to every device."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div
					role="radiogroup"
					aria-label="Theme"
					className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
				>
					{options.map((option) => {
						const selected = choice === option.id
						return (
							<button
								key={option.id}
								type="button"
								role="radio"
								aria-checked={selected}
								onClick={() => change(option.id)}
								className={cn(
									"grid gap-2.5 rounded-xl border p-2.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
									selected &&
										"border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/10"
								)}
							>
								{option.swatch ? (
									<ThemePreview swatch={option.swatch} />
								) : (
									<span className="relative grid">
										<ThemePreview swatch={LIGHT_SWATCH} />
										<span className="absolute inset-0 grid [clip-path:inset(0_0_0_50%)]">
											<ThemePreview
												swatch={DARK_SWATCH}
											/>
										</span>
									</span>
								)}
								<span className="flex items-start gap-2 px-0.5">
									<span className="grid min-w-0 flex-1 gap-0.5">
										<span className="flex items-center gap-1.5 text-sm font-medium">
											{!option.swatch && (
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
			</CardContent>
		</Card>
	)
}
