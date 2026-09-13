import { interpret } from "@/agents/interpreter";
import { narrate } from "@/agents/narrator";
import { proposeNextExperiments } from "@/agents/next-steps";
import {
  applyAnswer,
  buildClarifyingQuestions,
  buildDraftSpec,
} from "@/agents/defaults";
import { blockingQuestions } from "@/core/assumptions";
import { runBacktest } from "@/core/backtest/engine";
import { summarize } from "@/core/backtest/stats";
import { concludeFrom, evaluateGuards } from "@/core/backtest/guards";
import { specFingerprint, strategySpecSchema, type StrategySpec } from "@/core/spec";
import { getRepository } from "@/db";
import { newExperimentId, type ExperimentRecord } from "@/db/types";
import { loadBars, loadMeta } from "./dataset";

/**
 * The ASK -> CLARIFY -> DEFINE -> TEST -> LEARN pipeline, in one place.
 *
 * Route handlers stay thin on purpose: everything here is plain functions over
 * plain data, so the whole journey can be exercised from a script or a test
 * without an HTTP server.
 */

export async function createExperiment(
  question: string,
  options: { parentId?: string; forkedBecause?: string; specOverride?: StrategySpec } = {},
): Promise<ExperimentRecord> {
  const repo = getRepository();
  const bars = loadBars();
  const meta = loadMeta();

  const interpretation = await interpret(question);
  const { extraction } = interpretation;

  const drafted = buildDraftSpec(
    extraction,
    meta.actual_range.start,
    meta.actual_range.end,
  );

  // A forked experiment inherits a spec that is already settled, so the
  // clarify step has nothing left to ask and the ledger is already grounded.
  const spec = options.specOverride ?? drafted.spec;
  const assumptions = options.specOverride
    ? drafted.assumptions.map((a) =>
        a.provenance === "needs_user_input"
          ? {
              ...a,
              provenance: "user_confirmed" as const,
              rationale: "Inherited from the experiment this was forked from.",
            }
          : a,
      )
    : drafted.assumptions;

  const record: ExperimentRecord = {
    id: newExperimentId(),
    createdAt: new Date().toISOString(),
    question,
    spec,
    specFingerprint: specFingerprint(spec),
    assumptions,
    questions: options.specOverride ? [] : buildClarifyingQuestions(bars, spec),
    status: options.specOverride ? "clarified" : "draft",
    parentId: options.parentId ?? null,
    forkedBecause: options.forkedBecause ?? null,
    interpretationProvenance: {
      source: interpretation.source,
      provider: interpretation.provider,
      model: interpretation.model,
      latencyMs: interpretation.latencyMs,
      fallbackReason: interpretation.fallbackReason,
    },
    result: null,
  };

  return repo.create(record);
}

export async function submitAnswers(
  id: string,
  answers: Record<string, string | number>,
): Promise<ExperimentRecord | null> {
  const repo = getRepository();
  const record = await repo.get(id);
  if (!record) return null;

  let spec = record.spec;
  let assumptions = record.assumptions;

  for (const [questionId, value] of Object.entries(answers)) {
    const applied = applyAnswer(spec, assumptions, questionId, value);
    spec = applied.spec;
    assumptions = applied.assumptions;
  }

  const parsed = strategySpecSchema.safeParse(spec);
  if (!parsed.success) {
    throw new Error(
      `Answers produced an invalid experiment: ${parsed.error.issues[0]?.message}`,
    );
  }

  return repo.update(id, {
    spec: parsed.data,
    specFingerprint: specFingerprint(parsed.data),
    assumptions,
    status: blockingQuestions(assumptions).length ? "draft" : "clarified",
  });
}

/** Direct spec edit from the DEFINE panel, bypassing the question flow. */
export async function reviseSpec(
  id: string,
  spec: StrategySpec,
): Promise<ExperimentRecord | null> {
  const repo = getRepository();
  const record = await repo.get(id);
  if (!record) return null;

  const parsed = strategySpecSchema.parse(spec);
  const assumptions = record.assumptions.map((a) =>
    a.provenance === "needs_user_input"
      ? { ...a, provenance: "user_confirmed" as const, rationale: "Set directly by the user in the experiment definition." }
      : a,
  );

  return repo.update(id, {
    spec: parsed,
    specFingerprint: specFingerprint(parsed),
    assumptions,
    status: "clarified",
  });
}

export async function runExperiment(id: string): Promise<ExperimentRecord | null> {
  const repo = getRepository();
  const record = await repo.get(id);
  if (!record) return null;

  const blocking = blockingQuestions(record.assumptions);
  if (blocking.length) {
    throw new Error(
      `Cannot run yet - still undecided: ${blocking.map((b) => b.label).join(", ")}`,
    );
  }

  const bars = loadBars();
  const meta = loadMeta();
  const spec = strategySpecSchema.parse(record.spec);

  const raw = runBacktest(bars, spec);
  const stats = summarize(raw, spec);

  // How many experiments in this family have already been run against the same
  // data - the input to the multiple-testing guard.
  const variantsTestedInLineage = Math.max(1, await repo.countLineage(id));

  const guards = evaluateGuards(spec, raw, stats, {
    variantsTestedInLineage,
    datasetStart: meta.actual_range.start,
  });
  const conclusion = concludeFrom(stats, guards);
  const narration = await narrate(spec, stats, guards, conclusion);
  const nextExperiments = proposeNextExperiments(spec, stats, guards);

  return repo.update(id, {
    status: "complete",
    result: {
      stats,
      guards,
      conclusion,
      narration: narration.narration,
      nextExperiments,
      sampleTrades: raw.trades.slice(0, 200),
      narrationProvenance: {
        source: narration.source,
        provider: narration.provider,
        model: narration.model,
        latencyMs: narration.latencyMs,
        fallbackReason: narration.fallbackReason,
      },
      ranAt: new Date().toISOString(),
    },
  });
}

export async function forkExperiment(
  id: string,
  nextExperimentId: string,
): Promise<ExperimentRecord | null> {
  const repo = getRepository();
  const parent = await repo.get(id);
  if (!parent?.result) return null;

  const proposal = parent.result.nextExperiments.find(
    (n) => n.id === nextExperimentId,
  );
  if (!proposal) return null;

  const childSpec = strategySpecSchema.parse({
    ...parent.spec,
    ...proposal.patch,
  });

  return createExperiment(parent.question, {
    parentId: parent.id,
    forkedBecause: proposal.question,
    specOverride: childSpec,
  });
}

export async function getExperiment(id: string) {
  return getRepository().get(id);
}

export async function listExperiments(limit = 50) {
  return getRepository().list(limit);
}

export async function getLineage(id: string) {
  const repo = getRepository();
  return repo.children(id);
}
