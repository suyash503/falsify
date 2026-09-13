import type { Assumption, ClarifyingQuestion } from "@/core/assumptions";
import type { StrategySpec } from "@/core/spec";
import type { BacktestStats } from "@/core/backtest/stats";
import type { Conclusion, Guard } from "@/core/backtest/guards";
import type { Trade } from "@/core/backtest/engine";
import type { Narration } from "@/agents/schemas";
import type { NextExperiment } from "@/agents/next-steps";

export type ExperimentStatus = "draft" | "clarified" | "complete";

/** Which brain produced a given stage, recorded for the AI usage audit trail. */
export interface StageProvenance {
  source: "llm" | "deterministic";
  provider?: string;
  model?: string;
  latencyMs?: number;
  fallbackReason?: string;
}

export interface ExperimentResult {
  stats: BacktestStats;
  guards: Guard[];
  conclusion: Conclusion;
  narration: Narration;
  nextExperiments: NextExperiment[];
  /** Capped sample for the UI; the full set stays derivable from the spec. */
  sampleTrades: Trade[];
  narrationProvenance: StageProvenance;
  ranAt: string;
}

export interface ExperimentRecord {
  id: string;
  createdAt: string;
  question: string;
  spec: StrategySpec;
  specFingerprint: string;
  assumptions: Assumption[];
  questions: ClarifyingQuestion[];
  status: ExperimentStatus;
  /** Lineage. Null for a question typed from scratch. */
  parentId: string | null;
  /** Human summary of what this changed relative to its parent. */
  forkedBecause: string | null;
  interpretationProvenance: StageProvenance;
  result: ExperimentResult | null;
}

export interface Repository {
  readonly kind: "postgres" | "memory";
  create(record: ExperimentRecord): Promise<ExperimentRecord>;
  update(
    id: string,
    patch: Partial<ExperimentRecord>,
  ): Promise<ExperimentRecord | null>;
  get(id: string): Promise<ExperimentRecord | null>;
  list(limit?: number): Promise<ExperimentRecord[]>;
  /** Every completed experiment sharing a root ancestor, for multiple-testing counts. */
  countLineage(rootId: string): Promise<number>;
  children(id: string): Promise<ExperimentRecord[]>;
}

export function newExperimentId(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `exp_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
