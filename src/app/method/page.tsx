import { loadMeta } from "@/server/dataset";

export const dynamic = "force-dynamic";

export default function MethodPage() {
  const meta = loadMeta();

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Method</h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--ink-secondary)]">
        What this measures, what it refuses to claim, and the specific ways it
        could still be wrong.
      </p>

      <Section title="The comparison is the whole point">
        <p>
          A backtest that reports &ldquo;+1.2% per trade&rdquo; has not answered
          anything, because it has not said what the alternative was. NIFTY rose
          over most of the period studied, so almost any rule that puts you in
          the market for a while will show a profit.
        </p>
        <p>
          Every experiment therefore also runs the identical rules - same exit,
          same holding period, same costs - starting on <em>every</em> session
          in the test window. That unconditional set is the baseline, and the
          only number that speaks to the question is the difference between the
          two.
        </p>
      </Section>

      <Section title="Significance, and why the obvious test is wrong">
        <p>
          To judge whether a difference is meaningful, the system draws thousands
          of randomly-timed trade sets of the same size from the baseline and
          asks how often chance alone does at least as well. That share is the
          p-value shown with each result.
        </p>
        <p>
          The resampling uses contiguous blocks rather than independent draws.
          Forward returns overlap heavily - the five-day return starting Monday
          shares four days with Tuesday&rsquo;s - so treating them as independent
          would understate the true variation and manufacture significance out of
          noise. Block resampling keeps that correlation intact.
        </p>
        <p>
          The random seed is derived from the experiment definition, so the same
          experiment always returns the same p-value, and a changed experiment
          honestly returns a new one.
        </p>
      </Section>

      <Section title="Execution rules">
        <p>
          A fall is measured at the closing price, so the earliest a trade can be
          placed is the <strong>next session&rsquo;s open</strong>. Entering at
          the same close would require knowing that close before it was set. The
          impossible version is available as a diagnostic, and any result
          produced with it is marked invalid rather than reported.
        </p>
        <p>
          Where a target and a stop are both reachable within one session, daily
          data cannot say which came first. The system assumes the stop - the
          pessimistic reading - and counts how often it had to.
        </p>
        <p>
          Trades whose holding period would run past the end of the data are
          dropped rather than cut short, since a shortened trade measured over
          fewer days would quietly bias the average.
        </p>
      </Section>

      <Section title="What the language model does and does not do">
        <p>
          A language model reads the question: it identifies what was stated,
          names what is ambiguous, and writes the final explanation in plain
          English.
        </p>
        <p>
          It does not choose thresholds, does not compute any statistic, and does
          not decide the verdict. Those come from deterministic code, and the
          verdict is handed to the model as a fixed input it is instructed to
          express rather than reconsider. The failure mode being designed out is
          the obvious one - a fluent model narrating its way to a confident
          claim the evidence does not support.
        </p>
        <p>
          Where no model is configured, a rule-based reader and a template writer
          take over. Both paths are shown in the interface, so it is always clear
          which one produced what.
        </p>
      </Section>

      <Section title="Known limitations">
        <ul className="list-disc space-y-2 pl-5">
          {meta.known_limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
          <li>
            One index, one country, one era. Nothing here establishes that a
            finding would hold elsewhere.
          </li>
          <li>
            No out-of-sample holdout is enforced. The journal counts how many
            variants have been tried against the same data and warns as that
            number grows, but counting is not a substitute for fresh data.
          </li>
          <li>
            Position sizing, leverage, taxes and the behaviour of a real person
            watching a drawdown are all outside the model.
          </li>
        </ul>
      </Section>

      <Section title="Data">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
          {[
            ["Instrument", meta.instrument],
            ["Source", meta.source],
            ["Range", `${meta.actual_range.start} to ${meta.actual_range.end}`],
            ["Sessions", meta.rows.toLocaleString()],
            ["Retrieved", new Date(meta.retrieved_at).toLocaleDateString()],
            ["Checksum", meta.sha256.slice(0, 24)],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                {k}
              </dt>
              <dd className="font-mono text-xs text-[var(--ink-secondary)]">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--ink-secondary)]">
        {children}
      </div>
    </section>
  );
}
