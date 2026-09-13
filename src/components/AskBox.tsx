"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AskBox({ examples }: { examples: string[] }) {
  const router = useRouter();
  const [question, setQuestion] = useState(examples[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || question.trim().length < 5) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the experiment");
      router.push(`/e/${data.experiment.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={submit}>
        <label htmlFor="question" className="stage-label">
          Ask
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy}
            placeholder="Does buying NIFTY after a sharp fall work?"
            className="flex-1 rounded-lg border border-[var(--rule-strong)] bg-[var(--surface-1)] px-4 py-3 text-[15px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || question.trim().length < 5}
            className="rounded-lg px-5 py-3 text-[15px] font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: "var(--series-strategy)" }}
          >
            {busy ? "Reading the question..." : "Investigate"}
          </button>
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-3 text-sm"
          style={{ color: "var(--status-critical)" }}
        >
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setQuestion(ex)}
            disabled={busy}
            className="rounded-full border border-[var(--rule)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--ink-secondary)] hover:border-[var(--rule-strong)] disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
