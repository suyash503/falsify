import { z } from "zod";

/**
 * A StrategySpec is the machine-executable form of a vague research question.
 *
 * Design rule: every field here must be *decidable*. If a question cannot be
 * reduced to these fields, it cannot be tested, and the system should say so
 * rather than quietly inventing values.
 */

export const INSTRUMENTS = ["NIFTY50"] as const;
export const instrumentSchema = z.enum(INSTRUMENTS);
export type Instrument = z.infer<typeof instrumentSchema>;

/**
 * "Sharp fall" is the crux ambiguity of the seed question. There is no single
 * right reading, so we model the three readings a practitioner would actually
 * mean, and force the user to pick one.
 */
export const signalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("single_day_return"),
    /** Fires when one session's close-to-close return <= this. Negative. */
    thresholdPct: z.number().min(-50).max(0),
  }),
  z.object({
    kind: z.literal("n_day_return"),
    /** Fires when cumulative return over `windowDays` <= this. Negative. */
    thresholdPct: z.number().min(-80).max(0),
    windowDays: z.number().int().min(2).max(60),
  }),
  z.object({
    kind: z.literal("drawdown_from_high"),
    /** Fires when price is this far below its rolling high. Negative. */
    thresholdPct: z.number().min(-80).max(0),
    lookbackDays: z.number().int().min(5).max(504),
  }),
]);
export type Signal = z.infer<typeof signalSchema>;

/**
 * Entry timing is the single most common source of look-ahead bias in this
 * class of strategy. If the signal is computed from today's CLOSE, you cannot
 * also transact at today's close - you would need to know the close before it
 * happened. `next_open` is the honest default. `same_close` is offered only so
 * the user can see how much of the "edge" is actually an artefact.
 */
export const entryTimingSchema = z.enum(["next_open", "same_close"]);
export type EntryTiming = z.infer<typeof entryTimingSchema>;

export const exitSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fixed_holding"),
    holdingDays: z.number().int().min(1).max(250),
  }),
  z.object({
    kind: z.literal("target_or_stop"),
    /** Hard cap on holding period; the trade exits here if neither level hits. */
    holdingDays: z.number().int().min(1).max(250),
    targetPct: z.number().min(0).max(100),
    stopPct: z.number().min(-100).max(0),
  }),
]);
export type ExitRule = z.infer<typeof exitSchema>;

/**
 * Costs are expressed in basis points and charged on BOTH legs. Retail Indian
 * index-ETF/futures round trips are meaningfully above zero, and a 0.3% edge
 * that survives on paper can vanish entirely once charged. Defaults are
 * deliberately not zero.
 */
export const costsSchema = z.object({
  /** Brokerage + exchange fees + STT + stamp, one way. */
  brokerageBps: z.number().min(0).max(500),
  /** Assumed adverse fill vs the modelled price, one way. */
  slippageBps: z.number().min(0).max(500),
});
export type Costs = z.infer<typeof costsSchema>;

export const filtersSchema = z.object({
  /**
   * If a signal fires while a position is already open, do we open another?
   * Allowing overlap inflates the trade count and makes trades correlated,
   * which makes any significance test far too optimistic.
   */
  allowOverlappingTrades: z.boolean(),
  /** Optional restriction to a single calendar regime, for robustness checks. */
  excludeYears: z.array(z.number().int()).default([]),
});
export type Filters = z.infer<typeof filtersSchema>;

export const testPeriodSchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  })
  .refine((p) => p.start < p.end, {
    message: "Test period start must be before end",
  });
export type TestPeriod = z.infer<typeof testPeriodSchema>;

export const strategySpecSchema = z.object({
  instrument: instrumentSchema,
  signal: signalSchema,
  entryTiming: entryTimingSchema,
  exit: exitSchema,
  testPeriod: testPeriodSchema,
  costs: costsSchema,
  filters: filtersSchema,
  /**
   * The falsifiable claim. Stated so that the backtest can actually contradict
   * it. "Buying dips works" is not a hypothesis; the string below must name a
   * direction, a horizon and a comparison.
   */
  hypothesis: z.string().min(10).max(400),
});
export type StrategySpec = z.infer<typeof strategySpecSchema>;

/**
 * Human-readable rendering of the signal, used in the DEFINE panel and in the
 * narrative. Kept beside the schema so the two cannot drift apart.
 */
export function describeSignal(signal: Signal): string {
  switch (signal.kind) {
    case "single_day_return":
      return `NIFTY closes down ${Math.abs(signal.thresholdPct)}% or more in a single session`;
    case "n_day_return":
      return `NIFTY falls ${Math.abs(signal.thresholdPct)}% or more over ${signal.windowDays} trading days`;
    case "drawdown_from_high":
      return `NIFTY trades ${Math.abs(signal.thresholdPct)}% or more below its ${signal.lookbackDays}-day high`;
  }
}

export function describeExit(exit: ExitRule): string {
  switch (exit.kind) {
    case "fixed_holding":
      return `Sell after exactly ${exit.holdingDays} trading days, regardless of outcome`;
    case "target_or_stop":
      return `Sell at +${exit.targetPct}% target, ${exit.stopPct}% stop, or after ${exit.holdingDays} trading days - whichever comes first`;
  }
}

export function describeEntry(timing: EntryTiming): string {
  return timing === "next_open"
    ? "Buy at the OPEN of the next trading session after the signal"
    : "Buy at the SAME session's close (look-ahead - diagnostic only)";
}

/** Total round-trip cost in basis points. */
export function roundTripCostBps(costs: Costs): number {
  return (costs.brokerageBps + costs.slippageBps) * 2;
}

/**
 * Deterministic serialisation with keys sorted at every depth, so that two
 * specs which differ only in property order hash identically.
 *
 * Written by hand rather than via `JSON.stringify(value, replacer)`: passing an
 * array as the replacer makes it a key allowlist applied recursively, which
 * silently strips every nested field and collapses all specs to the same hash.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;

  const obj = value as Record<string, unknown>;
  const body = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",");
  return `{${body}}`;
}

/**
 * Stable content hash of a spec, used for experiment lineage and for detecting
 * that the user has re-run an identical configuration. Two FNV-1a passes with
 * different offsets, concatenated, to keep accidental collisions across a
 * research journal negligible.
 */
export function specFingerprint(spec: StrategySpec): string {
  const canonical = canonicalize(spec);

  const fnv = (offset: number) => {
    let h = offset;
    for (let i = 0; i < canonical.length; i++) {
      h ^= canonical.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };

  return fnv(0x811c9dc5) + fnv(0x9dc5811c);
}
