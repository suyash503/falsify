import Link from "next/link";
import { loadMeta } from "@/server/dataset";
import { providerStatus } from "@/llm/providers";
import { getRepository } from "@/db";
import AskBox from "@/components/AskBox";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "Does buying NIFTY after a sharp fall work?",
  "Is it worth buying NIFTY when it drops 3% in a day?",
  "Should I buy the dip and hold for a month?",
];

export default function Home() {
  const meta = loadMeta();
  const llm = providerStatus();
  const storage = getRepository().kind;

  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
        Ask a vague market question.
        <br />
        <span className="text-[var(--ink-secondary)]">
          Get an experiment you can argue with.
        </span>
      </h1>

      <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-secondary)]">
        Most questions about markets are untestable as asked. This tool does not
        answer them. It shows you what your question left undefined, makes every
        assumption visible before running anything, tests the result against
        simply being invested, and tells you plainly when the evidence does not
        support a conclusion.
      </p>

      <AskBox examples={EXAMPLES} />

      <section className="mt-16">
        <h2 className="stage-label">How it works</h2>
        <ol className="mt-4 space-y-4">
          {[
            {
              step: "Ask",
              body: "Type the question the way you would actually say it.",
            },
            {
              step: "Clarify",
              body: "The system names what is missing and refuses to guess the two things that matter most: what counts as a fall, and how long you would hold.",
            },
            {
              step: "Define",
              body: "Your question becomes a written experiment, with every parameter tagged by where it came from - you, or the system.",
            },
            {
              step: "Test",
              body: `Run against ${meta.rows.toLocaleString()} sessions of NIFTY 50 history, alongside the same rules applied to every other day for comparison.`,
            },
            {
              step: "Learn",
              body: "What the data shows and what the system concludes are reported separately, with the follow-up experiments worth running next.",
            },
          ].map(({ step, body }) => (
            <li key={step} className="flex gap-4">
              <span className="stage-label w-16 shrink-0 pt-1">{step}</span>
              <span className="text-sm leading-relaxed text-[var(--ink-secondary)]">
                {body}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card mt-12 p-5">
        <h2 className="stage-label">Running configuration</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Interpretation</dt>
            <dd className="mt-0.5 text-[var(--ink-secondary)]">
              {llm.activeId === "deterministic"
                ? "Rule-based (no API key configured)"
                : `${llm.activeLabel} - ${llm.activeModel}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Research journal</dt>
            <dd className="mt-0.5 text-[var(--ink-secondary)]">
              {storage === "postgres"
                ? "Postgres - experiments persist"
                : "In memory - experiments are lost on restart"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Dataset</dt>
            <dd className="mt-0.5 tabular text-[var(--ink-secondary)]">
              NIFTY 50 daily, {meta.actual_range.start} to {meta.actual_range.end}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ink-muted)]">Integrity</dt>
            <dd className="mt-0.5 font-mono text-xs text-[var(--ink-secondary)]">
              sha256 {meta.sha256.slice(0, 12)}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-[var(--ink-muted)]">
          Read the{" "}
          <Link href="/method" className="underline">
            method
          </Link>{" "}
          for what this deliberately does not do.
        </p>
      </section>
    </div>
  );
}
