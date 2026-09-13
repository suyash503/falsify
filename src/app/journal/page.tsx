import Link from "next/link";
import { listExperiments } from "@/server/experiments";
import { getRepository } from "@/db";

export const dynamic = "force-dynamic";

const VERDICT_COLOR: Record<string, string> = {
  INVALID: "var(--status-critical)",
  NO_EVIDENCE: "var(--ink-muted)",
  WEAK_EVIDENCE: "var(--status-warning)",
  SUGGESTIVE: "var(--status-good)",
};

export default async function JournalPage() {
  const experiments = await listExperiments(100);
  const storage = getRepository().kind;

  const completed = experiments.filter((e) => e.result);
  const roots = experiments.filter((e) => !e.parentId);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Research journal</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-secondary)]">
        Every experiment is kept, including the ones that found nothing -
        especially those. A record that only contains successes is how a
        research process quietly turns into a search for the one configuration
        that happened to work.
      </p>

      {storage === "memory" && (
        <p
          className="mt-4 rounded-lg px-3 py-2 text-xs"
          style={{
            background: "color-mix(in srgb, var(--status-warning) 12%, transparent)",
            color: "var(--ink-secondary)",
          }}
        >
          Running without a database, so this journal lives in memory and will be
          empty after a restart. Set <code>DATABASE_URL</code> to keep it.
        </p>
      )}

      {experiments.length > 0 && (
        <div className="mt-6 flex gap-6 text-sm">
          <span>
            <strong className="tabular">{experiments.length}</strong>{" "}
            <span className="text-[var(--ink-muted)]">experiments</span>
          </span>
          <span>
            <strong className="tabular">{completed.length}</strong>{" "}
            <span className="text-[var(--ink-muted)]">run</span>
          </span>
          <span>
            <strong className="tabular">{roots.length}</strong>{" "}
            <span className="text-[var(--ink-muted)]">lines of enquiry</span>
          </span>
        </div>
      )}

      {experiments.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--ink-secondary)]">
          Nothing yet.{" "}
          <Link href="/" className="underline">
            Ask a question
          </Link>{" "}
          to start one.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {experiments.map((e) => {
            const verdict = e.result?.conclusion.verdict;
            return (
              <li key={e.id}>
                <Link
                  href={`/e/${e.id}`}
                  className="card block p-4 no-underline transition-colors hover:border-[var(--rule-strong)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-[var(--ink-primary)]">
                        {e.forkedBecause ?? e.question}
                      </div>
                      <div className="mt-1 text-xs text-[var(--ink-secondary)]">
                        {e.result
                          ? e.result.conclusion.headline
                          : e.status === "draft"
                            ? "Waiting on clarification"
                            : "Defined, not yet run"}
                      </div>
                    </div>
                    {verdict && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{
                          background: `color-mix(in srgb, ${VERDICT_COLOR[verdict]} 14%, transparent)`,
                          color: VERDICT_COLOR[verdict],
                        }}
                      >
                        {verdict.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--ink-muted)]">
                    <span className="font-mono">{e.specFingerprint.slice(0, 8)}</span>
                    {e.parentId && <span>forked</span>}
                    {e.result && (
                      <span className="tabular">
                        {e.result.stats.tradeCount} trades &middot; p={" "}
                        {e.result.stats.pValue.toFixed(3)}
                      </span>
                    )}
                    <span>{new Date(e.createdAt).toLocaleDateString()}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
