"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExperimentRecord } from "@/db/types";
import type { Provenance } from "@/core/assumptions";
import type { Severity } from "@/core/backtest/guards";
import { ledgerSummary, blockingQuestions } from "@/core/assumptions";
import { describeEntry, describeExit, describeSignal } from "@/core/spec";
import DistributionChart from "./DistributionChart";
import { EquityCurve, YearStrip } from "./Charts";

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

const PROVENANCE_META: Record<
  Provenance,
  { label: string; color: string; short: string }
> = {
  user_stated: { label: "You said this", color: "var(--provenance-user)", short: "Yours" },
  user_confirmed: { label: "You chose this", color: "var(--provenance-user)", short: "Yours" },
  system_assumed: { label: "The system assumed this", color: "var(--provenance-assumed)", short: "Assumed" },
  needs_user_input: { label: "The system refuses to guess this", color: "var(--provenance-asking)", short: "Undecided" },
};

function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const meta = PROVENANCE_META[provenance];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, color: meta.color }}
      title={meta.label}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: meta.color }}
      />
      {meta.short}
    </span>
  );
}

function Stage({
  label,
  title,
  children,
  muted = false,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className={`mt-10 ${muted ? "opacity-55" : ""}`}>
      <div className="flex items-baseline gap-3">
        <span className="stage-label">{label}</span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tabular"
        style={emphasis ? { color: emphasis } : undefined}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs leading-snug text-[var(--ink-secondary)]">{hint}</div>
      )}
    </div>
  );
}

const SEVERITY_META: Record<Severity, { color: string; icon: string; label: string }> = {
  critical: { color: "var(--status-critical)", icon: "!", label: "Invalidating" },
  warning: { color: "var(--status-warning)", icon: "▲", label: "Caveat" },
  info: { color: "var(--ink-muted)", icon: "i", label: "Context" },
};

/* ------------------------------------------------------------------ */

export default function ExperimentView({
  initial,
  children: lineage,
}: {
  initial: ExperimentRecord;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [record, setRecord] = useState(initial);
  const [answers, setAnswers] = useState<Record<string, string | number>>(() =>
    Object.fromEntries(record.questions.map((q) => [q.id, q.defaultValue as string | number])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ledger = ledgerSummary(record.assumptions);
  const blocking = blockingQuestions(record.assumptions);
  const result = record.result;

  async function call(path: string, body?: unknown) {
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      return data;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }

  async function confirm() {
    setBusy("confirm");
    const data = await call(`/api/experiments/${record.id}/answers`, { answers });
    if (data) setRecord(data.experiment);
    setBusy(null);
  }

  async function run() {
    setBusy("run");
    const data = await call(`/api/experiments/${record.id}/run`);
    if (data) setRecord(data.experiment);
    setBusy(null);
  }

  async function fork(nextExperimentId: string) {
    setBusy(nextExperimentId);
    const data = await call(`/api/experiments/${record.id}/fork`, { nextExperimentId });
    if (data) router.push(`/e/${data.experiment.id}`);
    else setBusy(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      {/* ---------------- ASK ---------------- */}
      <div>
        <span className="stage-label">Ask</span>
        <h1 className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
          &ldquo;{record.question}&rdquo;
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-secondary)]">
          Interpreted by{" "}
          {record.interpretationProvenance.source === "llm"
            ? `${record.interpretationProvenance.provider} (${record.interpretationProvenance.model})`
            : "the rule-based reader - no language model configured"}
          {record.interpretationProvenance.fallbackReason && (
            <span style={{ color: "var(--status-serious)" }}>
              {" "}
              after the model failed: {record.interpretationProvenance.fallbackReason}
            </span>
          )}
          .
        </p>

        {record.parentId && (
          <p className="mt-3 rounded-lg border border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--ink-secondary)]">
            Forked from{" "}
            <Link href={`/e/${record.parentId}`} className="underline">
              an earlier experiment
            </Link>{" "}
            to ask: <strong>{record.forkedBecause}</strong>
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--status-critical) 10%, transparent)",
            color: "var(--status-critical)",
          }}
        >
          {error}
        </p>
      )}

      {/* ---------------- CLARIFY ---------------- */}
      {record.questions.length > 0 && (
        <Stage
          label="Clarify"
          title={
            blocking.length
              ? "Two things must be decided before this can be tested"
              : "Decided"
          }
          muted={blocking.length === 0}
        >
          {blocking.length > 0 && (
            <p className="mb-5 text-sm leading-relaxed text-[var(--ink-secondary)]">
              The system will not choose these for you. Each one changes the
              answer more than the result itself does, so picking silently would
              make the conclusion the system&rsquo;s rather than yours.
            </p>
          )}

          <div className="space-y-5">
            {record.questions.map((q) => (
              <fieldset key={q.id} className="card p-4">
                <legend className="px-1 text-sm font-semibold">{q.question}</legend>
                <p className="mt-1 mb-3 text-xs leading-relaxed text-[var(--ink-secondary)]">
                  {q.whyItMatters}
                </p>
                <div className="space-y-2">
                  {q.options.map((opt) => {
                    const selected = answers[q.id] === opt.value;
                    return (
                      <label
                        key={String(opt.value)}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors"
                        style={{
                          borderColor: selected ? "var(--series-strategy)" : "var(--rule)",
                          background: selected
                            ? "color-mix(in srgb, var(--series-strategy) 7%, transparent)"
                            : "transparent",
                        }}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          checked={selected}
                          onChange={() =>
                            setAnswers((a) => ({ ...a, [q.id]: opt.value as string | number }))
                          }
                          disabled={blocking.length === 0}
                          className="mt-1"
                        />
                        <span className="flex-1">
                          <span className="block text-sm">{opt.label}</span>
                          {opt.note && (
                            <span className="mt-0.5 block text-xs tabular text-[var(--ink-muted)]">
                              {opt.note}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          {blocking.length > 0 && (
            <button
              onClick={confirm}
              disabled={busy !== null}
              className="mt-5 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--series-strategy)" }}
            >
              {busy === "confirm" ? "Recording your choices..." : "Confirm these choices"}
            </button>
          )}
        </Stage>
      )}

      {/* ---------------- DEFINE ---------------- */}
      <Stage label="Define" title="The experiment, in full">
        <div className="card overflow-hidden">
          <dl className="divide-y divide-[var(--rule)]">
            {[
              { k: "Market", v: "NIFTY 50 index, daily closing data" },
              { k: "Condition", v: describeSignal(record.spec.signal) },
              { k: "Entry", v: describeEntry(record.spec.entryTiming) },
              { k: "Exit", v: describeExit(record.spec.exit) },
              {
                k: "Test period",
                v: `${record.spec.testPeriod.start} to ${record.spec.testPeriod.end}`,
              },
              {
                k: "Costs",
                v: `${record.spec.costs.brokerageBps} bps brokerage + ${record.spec.costs.slippageBps} bps slippage, charged each way`,
              },
              {
                k: "Positions",
                v: record.spec.filters.allowOverlappingTrades
                  ? "Overlapping positions allowed"
                  : "One position at a time",
                ...(record.spec.filters.excludeYears.length
                  ? { extra: `Excluding ${record.spec.filters.excludeYears.join(", ")}` }
                  : {}),
              },
            ].map((row) => (
              <div key={row.k} className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr]">
                <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                  {row.k}
                </dt>
                <dd className="text-sm text-[var(--ink-primary)]">
                  {row.v}
                  {"extra" in row && row.extra && (
                    <span className="block text-xs text-[var(--ink-secondary)]">
                      {row.extra}
                    </span>
                  )}
                </dd>
              </div>
            ))}
            <div className="grid gap-1 bg-[var(--surface-2)] px-4 py-3 sm:grid-cols-[9rem_1fr]">
              <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                Hypothesis
              </dt>
              <dd className="text-sm italic text-[var(--ink-secondary)]">
                {record.spec.hypothesis}
              </dd>
            </div>
          </dl>
        </div>

        {/* The assumption ledger */}
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Where every parameter came from</h3>
            <span className="text-xs tabular text-[var(--ink-muted)]">
              {ledger.userStated + ledger.userConfirmed} yours &middot;{" "}
              {ledger.systemAssumed} assumed &middot; {ledger.needsInput} undecided
            </span>
          </div>

          <div
            className="mt-2 flex h-1.5 overflow-hidden rounded-full"
            role="img"
            aria-label={`${ledger.userStated + ledger.userConfirmed} of ${ledger.total} parameters came from you.`}
          >
            {[
              { n: ledger.userStated + ledger.userConfirmed, c: "var(--provenance-user)" },
              { n: ledger.systemAssumed, c: "var(--provenance-assumed)" },
              { n: ledger.needsInput, c: "var(--provenance-asking)" },
            ].map((seg, i) =>
              seg.n ? (
                <span
                  key={i}
                  style={{
                    width: `${(seg.n / ledger.total) * 100}%`,
                    background: seg.c,
                    marginRight: 2,
                  }}
                />
              ) : null,
            )}
          </div>

          <ul className="mt-4 space-y-3">
            {record.assumptions.map((a) => (
              <li key={a.field} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{a.label}</div>
                    <div className="mt-0.5 text-sm text-[var(--ink-secondary)]">
                      {a.display}
                    </div>
                  </div>
                  <ProvenanceBadge provenance={a.provenance} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--ink-muted)]">
                  {a.rationale}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Stage>

      {/* ---------------- TEST ---------------- */}
      <Stage label="Test" title="Run it against nineteen years of history">
        {blocking.length > 0 ? (
          <p className="card px-4 py-3 text-sm text-[var(--ink-secondary)]">
            Still undecided:{" "}
            <strong>{blocking.map((b) => b.label).join(", ")}</strong>. Answer the
            questions above first.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={run}
              disabled={busy !== null}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--series-strategy)" }}
            >
              {busy === "run"
                ? "Running backtest and 4,000 resamples..."
                : result
                  ? "Run again"
                  : "Run the experiment"}
            </button>
            <span className="text-xs text-[var(--ink-secondary)]">
              Also runs the same rules on every other session, for comparison.
            </span>
          </div>
        )}
      </Stage>

      {/* ---------------- LEARN ---------------- */}
      {result && (
        <Stage label="Learn" title="What came back">
          <VerdictBanner result={result} />

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label="Occurrences"
              value={String(result.stats.tradeCount)}
              hint="times the condition fired"
            />
            <StatTile
              label="Avg after costs"
              value={`${result.stats.meanNetPct.toFixed(2)}%`}
              hint="per trade"
            />
            <StatTile
              label="Any day"
              value={`${result.stats.baseline.meanPct.toFixed(2)}%`}
              hint="same rules, every session"
            />
            <StatTile
              label="Difference"
              value={`${result.stats.edgePct >= 0 ? "+" : ""}${result.stats.edgePct.toFixed(2)}pp`}
              hint={`p = ${result.stats.pValue.toFixed(3)}`}
              emphasis={
                result.stats.pValue <= 0.05 && result.stats.edgePct > 0
                  ? "var(--status-good)"
                  : "var(--ink-primary)"
              }
            />
          </div>

          <div className="card mt-6 p-5">
            <DistributionChart
              histogram={result.stats.returnHistogram}
              strategyMean={result.stats.meanNetPct}
              baselineMean={result.stats.baseline.meanPct}
            />
          </div>

          {result.stats.equityCurve.length > 2 && (
            <div className="card mt-4 p-5">
              <EquityCurve points={result.stats.equityCurve} />
            </div>
          )}

          <div className="card mt-4 p-5">
            <YearStrip tradesByYear={result.stats.tradesByYear} />
          </div>

          {/* The separation the brief asks for, made structural */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <h3 className="text-sm font-semibold">What the data shows</h3>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Observations only. No interpretation.
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--ink-secondary)]">
                {result.narration.whatTheDataShows.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden className="text-[var(--ink-muted)]">
                      &middot;
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="card p-5"
              style={{ borderColor: "color-mix(in srgb, var(--series-strategy) 40%, var(--rule))" }}
            >
              <h3 className="text-sm font-semibold">What the system concludes</h3>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Interpretation. This is a judgement, not a measurement.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--ink-secondary)]">
                {result.narration.whatWeConclude}
              </p>
            </div>
          </div>

          <div className="card mt-4 p-5">
            <h3 className="text-sm font-semibold">
              What this does <em>not</em> establish
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--ink-secondary)]">
              {result.narration.whatWeCannotSay.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden style={{ color: "var(--status-serious)" }}>
                    &times;
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Guards */}
          <div className="mt-8">
            <h3 className="text-sm font-semibold">
              Reasons this could be wrong
              <span className="ml-2 font-normal text-[var(--ink-muted)]">
                ({result.guards.length} checked)
              </span>
            </h3>
            <ul className="mt-3 space-y-2">
              {result.guards.map((g) => {
                const meta = SEVERITY_META[g.severity];
                return (
                  <li key={g.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: meta.color }}
                      >
                        {meta.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-medium">{g.title}</span>
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
                          {g.detail}
                        </p>
                        {g.remedy && (
                          <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
                            <strong>What to do:</strong> {g.remedy}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Next experiments */}
          {result.nextExperiments.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold">What to investigate next</h3>
              <p className="mt-1 text-xs text-[var(--ink-muted)]">
                Each one opens a new experiment that remembers it came from this one.
              </p>
              <div className="mt-3 space-y-2">
                {result.nextExperiments.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => fork(n.id)}
                    disabled={busy !== null}
                    className="card w-full p-4 text-left transition-colors hover:border-[var(--rule-strong)] disabled:opacity-50"
                  >
                    <div className="text-sm font-medium">
                      {busy === n.id ? "Creating experiment..." : n.question}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
                      {n.whyItMatters}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-8 text-xs leading-relaxed text-[var(--ink-muted)]">
            Narrated by{" "}
            {result.narrationProvenance.source === "llm"
              ? `${result.narrationProvenance.provider} (${result.narrationProvenance.model})`
              : "the rule-based writer"}
            , from statistics it did not compute and a verdict it could not
            change. Run at {new Date(result.ranAt).toLocaleString()}.
          </p>
        </Stage>
      )}

      {lineage}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function VerdictBanner({ result }: { result: NonNullable<ExperimentRecord["result"]> }) {
  const colors: Record<string, string> = {
    INVALID: "var(--status-critical)",
    NO_EVIDENCE: "var(--ink-secondary)",
    WEAK_EVIDENCE: "var(--status-warning)",
    SUGGESTIVE: "var(--status-good)",
  };
  const color = colors[result.conclusion.verdict] ?? "var(--ink-secondary)";

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        borderColor: `color-mix(in srgb, ${color} 45%, var(--rule))`,
        background: `color-mix(in srgb, ${color} 7%, var(--surface-1))`,
      }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color }}
      >
        {result.conclusion.verdict.replace(/_/g, " ")}
      </div>
      <h3 className="mt-1.5 text-lg font-semibold leading-snug">
        {result.conclusion.headline}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)]">
        {result.conclusion.reasoning}
      </p>
    </div>
  );
}
