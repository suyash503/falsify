import type { Bar } from "@/core/bars";
import { detectSignals } from "@/core/backtest/engine";
import type { Assumption, ClarifyingQuestion } from "@/core/assumptions";
import {
  describeEntry,
  describeExit,
  describeSignal,
  type Signal,
  type StrategySpec,
} from "@/core/spec";
import type { Extraction } from "./schemas";

/**
 * Where the system's opinions live.
 *
 * Every default below is a judgement call, and each one carries the reasoning
 * that justifies it. Two of them - what counts as a sharp fall, and how long to
 * hold - are judged too consequential to make on the user's behalf at all, so
 * they are raised as blocking questions instead. That is the difference between
 * a tool that assists research and one that quietly does the deciding.
 */

/* Cost model. Retail Indian index exposure via a liquid ETF or the near-month
 * future. Deliberately not zero: a "profitable" rule that only works at zero
 * cost is a rounding error wearing a strategy costume. */
export const DEFAULT_BROKERAGE_BPS = 5;
export const DEFAULT_SLIPPAGE_BPS = 10;

export const DEFAULT_HOLDING_DAYS = 5;
export const DEFAULT_FALL_PCT = -2;

/** The readings of "sharp fall" the system is prepared to test. */
export const SIGNAL_OPTIONS: { key: string; label: string; signal: Signal }[] = [
  {
    key: "d1",
    label: "One session down 1% or more",
    signal: { kind: "single_day_return", thresholdPct: -1 },
  },
  {
    key: "d2",
    label: "One session down 2% or more",
    signal: { kind: "single_day_return", thresholdPct: -2 },
  },
  {
    key: "d3",
    label: "One session down 3% or more",
    signal: { kind: "single_day_return", thresholdPct: -3 },
  },
  {
    key: "w5",
    label: "Down 5% or more across a week",
    signal: { kind: "n_day_return", thresholdPct: -5, windowDays: 5 },
  },
  {
    key: "dd10",
    label: "10% or more below the past year's high",
    signal: { kind: "drawdown_from_high", thresholdPct: -10, lookbackDays: 252 },
  },
];

export const HOLDING_OPTIONS = [
  { days: 1, label: "1 trading day", note: "Tests an immediate bounce." },
  { days: 5, label: "1 week (5 sessions)", note: "Tests a short-term rebound." },
  { days: 20, label: "1 month (20 sessions)", note: "Tests a recovery." },
  { days: 60, label: "1 quarter (60 sessions)", note: "Mostly measures market drift." },
];

/* ------------------------------------------------------------------ */

export function buildDraftSpec(
  extraction: Extraction,
  datasetStart: string,
  datasetEnd: string,
): { spec: StrategySpec; assumptions: Assumption[] } {
  const signal: Signal =
    extraction.statedFallPct !== null
      ? extraction.statedFallWindowDays && extraction.statedFallWindowDays > 1
        ? {
            kind: "n_day_return",
            thresholdPct: extraction.statedFallPct,
            windowDays: extraction.statedFallWindowDays,
          }
        : { kind: "single_day_return", thresholdPct: extraction.statedFallPct }
      : { kind: "single_day_return", thresholdPct: DEFAULT_FALL_PCT };

  const holdingDays = extraction.statedHoldingDays ?? DEFAULT_HOLDING_DAYS;

  const spec: StrategySpec = {
    instrument: "NIFTY50",
    signal,
    entryTiming: "next_open",
    exit: { kind: "fixed_holding", holdingDays },
    testPeriod: { start: datasetStart, end: datasetEnd },
    costs: {
      brokerageBps: DEFAULT_BROKERAGE_BPS,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
    },
    filters: { allowOverlappingTrades: false, excludeYears: [] },
    hypothesis: extraction.hypothesis,
  };

  const assumptions: Assumption[] = [
    {
      field: "signal",
      label: "What counts as a sharp fall",
      display: describeSignal(signal),
      provenance:
        extraction.statedFallPct !== null ? "user_stated" : "needs_user_input",
      impact: "high",
      rationale:
        extraction.statedFallPct !== null
          ? "Taken directly from the size the user gave in the question."
          : "The question never defines it, and the choice changes the answer more than anything else here: a 1% threshold fires several hundred times and describes ordinary noise, while a 5% threshold fires a handful of times and describes only crises. The system will not pick this silently.",
      alternatives: SIGNAL_OPTIONS.map((o) => o.label),
    },
    {
      field: "exit.holdingDays",
      label: "How long the position is held",
      display: describeExit(spec.exit),
      provenance:
        extraction.statedHoldingDays !== null ? "user_stated" : "needs_user_input",
      impact: "high",
      rationale:
        extraction.statedHoldingDays !== null
          ? "Taken directly from the holding period the user gave."
          : "The word 'work' has no meaning without a horizon. The same entry rule can look like a loss over one day and a gain over one quarter, and most of the gain over a quarter is simply the market drifting upward rather than anything the signal predicted.",
      alternatives: HOLDING_OPTIONS.map((o) => o.label),
    },
    {
      field: "entryTiming",
      label: "When the trade is entered",
      display: describeEntry(spec.entryTiming),
      provenance: "system_assumed",
      impact: "high",
      rationale:
        "The fall is measured at the closing price, so the earliest moment anyone could actually act on it is the next session's open. Entering at the same close would mean trading on a price that had not been set yet. This one the system does decide, because the alternative is not a preference - it is an error.",
      alternatives: ["Same session's close (look-ahead; available as a diagnostic)"],
    },
    {
      field: "testPeriod",
      label: "Period tested",
      display: `${datasetStart} to ${datasetEnd}`,
      provenance: "system_assumed",
      impact: "medium",
      rationale:
        "The full history available, covering the 2008 crash, the 2020 pandemic fall and the recoveries after both. Using everything avoids quietly choosing a window that flatters the result.",
      alternatives: ["A shorter recent window", "Excluding crisis years"],
    },
    {
      field: "costs",
      label: "Trading costs",
      display: `${DEFAULT_BROKERAGE_BPS} bps brokerage + ${DEFAULT_SLIPPAGE_BPS} bps slippage, each way`,
      provenance: "system_assumed",
      impact: "medium",
      rationale:
        "Roughly what retail index exposure costs through a liquid ETF or the near-month future, charged on both legs. Assuming zero cost is the most common way a backtest flatters itself.",
      alternatives: ["Zero cost (unrealistic)", "Higher cost for less liquid access"],
    },
    {
      field: "filters.allowOverlappingTrades",
      label: "Overlapping positions",
      display: "One position at a time",
      provenance: "system_assumed",
      impact: "medium",
      rationale:
        "Falls arrive in clusters, so allowing overlap would open several positions across the same few days. They would share the same market movement, which inflates the apparent number of independent observations and makes any significance test look better than it is.",
      alternatives: ["Allow overlapping positions"],
    },
  ];

  return { spec, assumptions };
}

/* ------------------------------------------------------------------ */

/**
 * Clarifying questions, with every option annotated by how often it actually
 * happened in the data. A user choosing "3% or more" deserves to know that
 * means 57 occurrences in nineteen years before they choose it.
 */
export function buildClarifyingQuestions(
  bars: Bar[],
  spec: StrategySpec,
): ClarifyingQuestion[] {
  const lastIndex = bars.length - 1;

  const signalOptions = SIGNAL_OPTIONS.map((opt) => {
    const count = detectSignals(bars, opt.signal, 0, lastIndex).length;
    return {
      label: opt.label,
      value: opt.key,
      note: `${count} occurrence${count === 1 ? "" : "s"} in the available history`,
    };
  });

  const years =
    (new Date(spec.testPeriod.end).getTime() -
      new Date(spec.testPeriod.start).getTime()) /
    (365.25 * 24 * 3600 * 1000);

  return [
    {
      id: "signal",
      field: "signal",
      question: "What should count as a sharp fall?",
      whyItMatters:
        `This single choice moves the result more than anything else. A loose threshold gathers hundreds of ordinary down days; a strict one gathers only crises, and then the answer is really about ${Math.round(years)} years containing two of them.`,
      options: signalOptions,
      defaultValue: "d2",
    },
    {
      id: "holding",
      field: "exit.holdingDays",
      question: "How long would you hold after buying?",
      whyItMatters:
        "There is no such thing as an idea that 'works' without a horizon. Longer holds tend to show larger gains, but mostly because the market drifts upward over time - not because the fall predicted anything. The system compares against that drift so the two can be told apart.",
      options: HOLDING_OPTIONS.map((o) => ({
        label: o.label,
        value: o.days,
        note: o.note,
      })),
      defaultValue: DEFAULT_HOLDING_DAYS,
    },
  ];
}

/** Apply a clarify answer back onto the spec and mark the ledger as confirmed. */
export function applyAnswer(
  spec: StrategySpec,
  assumptions: Assumption[],
  questionId: string,
  value: string | number,
): { spec: StrategySpec; assumptions: Assumption[] } {
  let next = { ...spec };

  if (questionId === "signal") {
    const chosen = SIGNAL_OPTIONS.find((o) => o.key === value);
    if (chosen) next = { ...next, signal: chosen.signal };
  }

  if (questionId === "holding") {
    const days = Number(value);
    if (Number.isFinite(days) && days >= 1 && days <= 250) {
      next = {
        ...next,
        exit:
          next.exit.kind === "fixed_holding"
            ? { kind: "fixed_holding", holdingDays: days }
            : { ...next.exit, holdingDays: days },
      };
    }
  }

  const fieldFor: Record<string, string> = {
    signal: "signal",
    holding: "exit.holdingDays",
  };
  const targetField = fieldFor[questionId];

  const nextAssumptions = assumptions.map((a) => {
    if (a.field !== targetField) return a;
    return {
      ...a,
      provenance: "user_confirmed" as const,
      display:
        targetField === "signal"
          ? describeSignal(next.signal)
          : describeExit(next.exit),
      rationale: "Chosen by the user when the system asked.",
    };
  });

  return { spec: next, assumptions: nextAssumptions };
}
