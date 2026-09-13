import { beforeEach, describe, expect, it } from "vitest";
import {
  createExperiment,
  forkExperiment,
  runExperiment,
  submitAnswers,
} from "@/server/experiments";
import { blockingQuestions, ledgerSummary } from "@/core/assumptions";

/**
 * End-to-end over the real dataset, with the in-memory repository and no API
 * key. This is the configuration a reviewer gets when they clone the repo, so
 * it is the one that must never break.
 */

const SEED_QUESTION = "Does buying NIFTY after a sharp fall work?";

beforeEach(() => {
  globalThis.__falsifyStore = new Map();
});

describe("ASK -> CLARIFY", () => {
  it("turns the seed question into a draft that refuses to run yet", async () => {
    const exp = await createExperiment(SEED_QUESTION);

    expect(exp.status).toBe("draft");
    expect(exp.question).toBe(SEED_QUESTION);

    // The two genuinely consequential gaps must be raised, not assumed away.
    const blocking = blockingQuestions(exp.assumptions);
    expect(blocking.map((b) => b.field).sort()).toEqual([
      "exit.holdingDays",
      "signal",
    ]);

    // ...and everything else must still carry a declared origin.
    for (const a of exp.assumptions) {
      expect(a.rationale.length).toBeGreaterThan(10);
      expect(["user_stated", "user_confirmed", "system_assumed", "needs_user_input"])
        .toContain(a.provenance);
    }
  });

  it("grounds every clarifying option in a real occurrence count", async () => {
    const exp = await createExperiment(SEED_QUESTION);
    const signalQuestion = exp.questions.find((q) => q.id === "signal");
    expect(signalQuestion).toBeDefined();

    for (const opt of signalQuestion!.options) {
      expect(opt.note).toMatch(/\d+ occurrences? in the available history/);
    }
  });

  it("takes a stated number from the user instead of asking about it", async () => {
    const exp = await createExperiment(
      "Does buying NIFTY after it falls 3% in a day and holding 10 days work?",
    );
    const fall = exp.assumptions.find((a) => a.field === "signal")!;
    const hold = exp.assumptions.find((a) => a.field === "exit.holdingDays")!;

    expect(fall.provenance).toBe("user_stated");
    expect(hold.provenance).toBe("user_stated");
    expect(blockingQuestions(exp.assumptions)).toHaveLength(0);
  });

  it("never assumes the look-ahead entry", async () => {
    const exp = await createExperiment(SEED_QUESTION);
    expect(exp.spec.entryTiming).toBe("next_open");
  });
});

describe("CLARIFY -> DEFINE", () => {
  it("records the user's answers as confirmed, not assumed", async () => {
    const created = await createExperiment(SEED_QUESTION);
    const answered = await submitAnswers(created.id, {
      signal: "d3",
      holding: 20,
    });

    expect(answered!.status).toBe("clarified");
    expect(answered!.spec.signal).toEqual({
      kind: "single_day_return",
      thresholdPct: -3,
    });
    expect(answered!.spec.exit.holdingDays).toBe(20);

    const ledger = ledgerSummary(answered!.assumptions);
    expect(ledger.needsInput).toBe(0);
    expect(ledger.userConfirmed).toBe(2);
    expect(ledger.groundedRatio).toBeGreaterThan(0);
  });

  it("changes the fingerprint when the definition changes", async () => {
    const created = await createExperiment(SEED_QUESTION);
    const answered = await submitAnswers(created.id, { signal: "d3", holding: 20 });
    expect(answered!.specFingerprint).not.toBe(created.specFingerprint);
  });
});

describe("TEST -> LEARN", () => {
  it("refuses to run while a high-impact question is open", async () => {
    const created = await createExperiment(SEED_QUESTION);
    await expect(runExperiment(created.id)).rejects.toThrow(/still undecided/i);
  });

  it("produces a result that compares against a baseline", async () => {
    const created = await createExperiment(SEED_QUESTION);
    await submitAnswers(created.id, { signal: "d2", holding: 5 });
    const done = await runExperiment(created.id);

    expect(done!.status).toBe("complete");
    const { stats, conclusion, narration } = done!.result!;

    expect(stats.tradeCount).toBeGreaterThan(0);
    expect(stats.baseline.sampleSize).toBeGreaterThan(stats.tradeCount);
    expect(stats.pValue).toBeGreaterThan(0);
    expect(stats.pValue).toBeLessThanOrEqual(1);

    // The narrator must not be able to promise more than the verdict allows.
    expect(["INVALID", "NO_EVIDENCE", "WEAK_EVIDENCE", "SUGGESTIVE"]).toContain(
      conclusion.verdict,
    );
    expect(narration.whatTheDataShows.length).toBeGreaterThan(0);
    expect(narration.whatWeCannotSay.length).toBeGreaterThan(0);
  });

  it("reports the honest answer to the seed question", async () => {
    // The naive reading of the question. This asserts the real finding: on
    // nineteen years of NIFTY, a 2% one-day fall does not beat simply being
    // invested. If a future data refresh changes this, the test should fail
    // loudly rather than let the README keep claiming otherwise.
    const created = await createExperiment(SEED_QUESTION);
    await submitAnswers(created.id, { signal: "d2", holding: 5 });
    const done = await runExperiment(created.id);
    const { stats, conclusion } = done!.result!;

    expect(stats.pValue).toBeGreaterThan(0.05);
    expect(conclusion.verdict).toBe("NO_EVIDENCE");
  });

  it("offers follow-up experiments derived from what actually went wrong", async () => {
    const created = await createExperiment(SEED_QUESTION);
    await submitAnswers(created.id, { signal: "d2", holding: 5 });
    const done = await runExperiment(created.id);

    const next = done!.result!.nextExperiments;
    expect(next.length).toBeGreaterThan(0);
    for (const n of next) {
      expect(n.question.length).toBeGreaterThan(10);
      expect(Object.keys(n.patch).length).toBeGreaterThan(0);
    }
  });
});

describe("lineage and multiple testing", () => {
  it("forks into a child that records why it exists", async () => {
    const created = await createExperiment(SEED_QUESTION);
    await submitAnswers(created.id, { signal: "d2", holding: 5 });
    const parent = await runExperiment(created.id);

    const proposal = parent!.result!.nextExperiments[0];
    const child = await forkExperiment(parent!.id, proposal.id);

    expect(child).not.toBeNull();
    expect(child!.parentId).toBe(parent!.id);
    expect(child!.forkedBecause).toBe(proposal.question);
    // A fork arrives already specified - the clarify step has nothing to ask.
    expect(child!.status).toBe("clarified");
    expect(blockingQuestions(child!.assumptions)).toHaveLength(0);
  });

  it("warns about multiple testing once a lineage accumulates runs", async () => {
    const created = await createExperiment(SEED_QUESTION);
    await submitAnswers(created.id, { signal: "d2", holding: 5 });
    let current = await runExperiment(created.id);

    // Walk three forks deep, running each one.
    for (let i = 0; i < 3; i++) {
      const proposal = current!.result!.nextExperiments[0];
      const child = await forkExperiment(current!.id, proposal.id);
      current = await runExperiment(child!.id);
    }

    const ids = current!.result!.guards.map((g) => g.id);
    expect(ids).toContain("MULTIPLE_TESTING");
  });
});
