import { z } from "zod";

/**
 * The assumption ledger.
 *
 * The brief asks us to distinguish three things:
 *   - what the user actually said
 *   - what the system assumed
 *   - what the system should ask the user
 *
 * Rather than treat that as a presentation concern, we make it a property of
 * every parameter in the spec. Nothing reaches the backtest engine without a
 * declared origin. This is what stops the prototype from silently inventing
 * "sharp fall = -2%" and presenting the result as if the user had asked for it.
 */

export const provenanceSchema = z.enum([
  /** Extracted from the user's own words. Highest trust. */
  "user_stated",
  /** The user explicitly answered a clarifying question. */
  "user_confirmed",
  /** The system chose this. Must carry a rationale and be visible in the UI. */
  "system_assumed",
  /** The system refuses to choose; the answer materially changes the result. */
  "needs_user_input",
]);
export type Provenance = z.infer<typeof provenanceSchema>;

/**
 * How much the conclusion moves if this value is wrong. Used to rank what the
 * system asks about - we only interrupt the user for `high` impact fields.
 */
export const impactSchema = z.enum(["high", "medium", "low"]);
export type Impact = z.infer<typeof impactSchema>;

export const assumptionSchema = z.object({
  /** Dot-path into StrategySpec, e.g. "signal.thresholdPct". */
  field: z.string().min(1),
  /** Short human label for the DEFINE panel. */
  label: z.string().min(1),
  /** The value as rendered for a human, e.g. "-2%" or "5 trading days". */
  display: z.string().min(1),
  provenance: provenanceSchema,
  impact: impactSchema,
  /** Why this value and not another. Required for anything system-chosen. */
  rationale: z.string().min(1),
  /**
   * Other defensible values. Surfacing these is the difference between "the
   * system decided" and "the system decided, and showed its work".
   */
  alternatives: z.array(z.string()).default([]),
});
export type Assumption = z.infer<typeof assumptionSchema>;

export const clarifyingQuestionSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  question: z.string().min(1),
  /** Why this matters - shown inline so the user is not just obeying a form. */
  whyItMatters: z.string().min(1),
  options: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.union([z.string(), z.number(), z.boolean()]),
        /** Consequence of this choice, e.g. "~340 signals since 2007". */
        note: z.string().optional(),
      }),
    )
    .min(2),
  /** Which option the system would pick if the user declines to answer. */
  defaultValue: z.union([z.string(), z.number(), z.boolean()]),
});
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;

/** Ledger summary used by the UI to show how much of the spec is guesswork. */
export function ledgerSummary(assumptions: Assumption[]) {
  const by = (p: Provenance) => assumptions.filter((a) => a.provenance === p).length;
  const total = assumptions.length || 1;
  const grounded = by("user_stated") + by("user_confirmed");
  return {
    total: assumptions.length,
    userStated: by("user_stated"),
    userConfirmed: by("user_confirmed"),
    systemAssumed: by("system_assumed"),
    needsInput: by("needs_user_input"),
    /** 0-1. How much of the experiment the user actually specified. */
    groundedRatio: grounded / total,
  };
}

/**
 * An experiment is only safe to run when no `high` impact field is still
 * unanswered. Medium/low gaps are allowed to ride on defaults, because
 * interrupting the user for every one of them would be its own kind of bad
 * product design.
 */
export function blockingQuestions(assumptions: Assumption[]): Assumption[] {
  return assumptions.filter(
    (a) => a.provenance === "needs_user_input" && a.impact === "high",
  );
}
