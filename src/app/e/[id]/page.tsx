import Link from "next/link";
import { notFound } from "next/navigation";
import ExperimentView from "@/components/ExperimentView";
import { getExperiment, getLineage } from "@/server/experiments";
import { getRepository } from "@/db";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({
  params,
}: PageProps<"/e/[id]">) {
  const { id } = await params;
  const experiment = await getExperiment(id);

  if (!experiment) {
    // On a serverless host the in-memory store is not shared: route handlers
    // and page renders run as separate functions with separate memory, so an
    // experiment created a moment ago is genuinely invisible here. A bare 404
    // would look like a broken application rather than a missing database.
    if (getRepository().kind === "memory") {
      return <NoDatabaseNotice id={id} />;
    }
    notFound();
  }

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

/**
 * Shown when the journal has no database behind it and the record was created
 * by a different serverless instance. Explaining the cause is more useful than
 * a 404, and it keeps the deployed demo honest about its own configuration
 * rather than looking simply broken.
 */
function NoDatabaseNotice({ id }: { id: string }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <span className="stage-label">Experiment unavailable</span>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        This deployment has no database attached
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[var(--ink-secondary)]">
        The experiment <code className="font-mono text-xs">{id}</code> was
        created, but the research journal is running in memory. On a serverless
        host each request can be handled by a different instance, and they do not
        share memory - so the record is not visible from here.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-secondary)]">
        Setting <code className="font-mono text-xs">DATABASE_URL</code> to any
        Postgres connection string fixes this and makes the journal persistent,
        which is what it is designed for. Running locally with{" "}
        <code className="font-mono text-xs">npm run dev</code> also works, since
        there is only one process.
      </p>
      <div className="mt-6 flex gap-4">
        <Link
          href="/"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white no-underline"
          style={{ background: "var(--series-strategy)" }}
        >
          Start again
        </Link>
        <Link
          href="/method"
          className="rounded-lg border border-[var(--rule-strong)] px-4 py-2 text-sm no-underline text-[var(--ink-secondary)]"
        >
          Read the method
        </Link>
      </div>
    </div>
  );
}
