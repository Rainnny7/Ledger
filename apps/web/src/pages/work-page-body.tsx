import { ChevronDown, Users } from "lucide-react"
import { EmptyWork } from "@/components/work/empty-work"
import { JobSection } from "@/components/work/job-section"
import type { useWorkPage } from "@/pages/use-work-page"
import { WorkPageStats } from "@/pages/work-page-stats"
import { cn } from "cn"

type WorkPageState = ReturnType<typeof useWorkPage>

/** Work page job grid, stats, and archived section once data has loaded. */
export function WorkPageBody({ page }: { page: WorkPageState }) {
	if (page.jobs.length === 0 && page.sharedActive.length === 0) {
		return <EmptyWork onAdd={() => page.setJobDialog({ job: null })} />
	}

	return (
		<>
			<WorkPageStats page={page} />

			{page.active.length > 0 && (
				<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] items-start gap-4">
					{page.active.map((job) => (
						<JobSection key={job.id} job={job} {...page.actions} />
					))}
				</div>
			)}

			{page.sharedActive.length > 0 && (
				<section className="grid gap-4">
					<h2 className="flex items-center gap-2 text-sm font-semibold">
						<Users className="size-4 text-primary" /> Shared with
						you
					</h2>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] items-start gap-4">
						{page.sharedActive.map((job) => (
							<JobSection
								key={job.id}
								job={job}
								{...page.actions}
							/>
						))}
					</div>
				</section>
			)}

			{page.archived.length > 0 && (
				<section className="grid gap-3">
					<button
						type="button"
						className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
						onClick={() => page.setShowArchived((open) => !open)}
					>
						<ChevronDown
							className={cn(
								"size-4 transition-transform",
								!page.showArchived && "-rotate-90"
							)}
						/>
						Archived jobs ({page.archived.length})
					</button>
					{page.showArchived && (
						<div className="grid animate-in grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] items-start gap-4 opacity-80 duration-200 fade-in-0">
							{page.archived.map((job) => (
								<JobSection
									key={job.id}
									job={job}
									{...page.actions}
								/>
							))}
						</div>
					)}
				</section>
			)}
		</>
	)
}
