import Link from "next/link";
import { notFound } from "next/navigation";
import ExperimentView from "@/components/ExperimentView";
import { getExperiment, getLineage } from "@/server/experiments";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({
  params,
}: PageProps<"/e/[id]">) {
  const { id } = await params;
  const experiment = await getExperiment(id);
  if (!experiment) notFound();

  const children = await getLineage(id);

  return (
    <ExperimentView initial={experiment}>
      {children.length > 0 && (
        <section className="mt-12 border-t border-[var(--rule)] pt-6">
          <h2 className="stage-label">Followed by</h2>
          <ul className="mt-3 space-y-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/e/${child.id}`}
                  className="card block p-4 no-underline transition-colors hover:border-[var(--rule-strong)]"
                >
                  <div className="text-sm font-medium text-[var(--ink-primary)]">
                    {child.forkedBecause ?? "A follow-up experiment"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--ink-secondary)]">
                    {child.result
                      ? `${child.result.conclusion.verdict.replace(/_/g, " ")} - ${child.result.conclusion.headline}`
                      : "Not yet run"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </ExperimentView>
  );
}
