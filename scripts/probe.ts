/**
 * Exploratory harness. Runs a grid of "sharp fall" definitions against the
 * frozen dataset so we know what the honest answer actually is before any UI
 * is built around it.
 *
 *   npx tsx scripts/probe.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBarsCsv } from "../src/core/bars";
import { runBacktest } from "../src/core/backtest/engine";
import { summarize } from "../src/core/backtest/stats";
import { evaluateGuards, concludeFrom } from "../src/core/backtest/guards";
import type { StrategySpec } from "../src/core/spec";

const bars = parseBarsCsv(
  readFileSync(path.join(process.cwd(), "data", "nifty50_daily.csv"), "utf-8"),
);
console.log(`dataset: ${bars.length} bars, ${bars[0].date} -> ${bars[bars.length - 1].date}\n`);

function baseSpec(overrides: Partial<StrategySpec> = {}): StrategySpec {
  return {
    instrument: "NIFTY50",
    signal: { kind: "single_day_return", thresholdPct: -2 },
    entryTiming: "next_open",
    exit: { kind: "fixed_holding", holdingDays: 5 },
    testPeriod: { start: "2007-09-17", end: "2026-09-11" },
    costs: { brokerageBps: 5, slippageBps: 10 },
    filters: { allowOverlappingTrades: false, excludeYears: [] },
    hypothesis: "Buying NIFTY after a sharp fall beats buying on an average day.",
    ...overrides,
  };
}

function report(label: string, spec: StrategySpec) {
  const raw = runBacktest(bars, spec);
  const stats = summarize(raw, spec);
  const guards = evaluateGuards(spec, raw, stats, { variantsTestedInLineage: 1, datasetStart: "2007-09-17" });
  const conclusion = concludeFrom(stats, guards);

  console.log(`--- ${label}`);
  console.log(
    `  trades=${stats.tradeCount}  mean=${stats.meanNetPct.toFixed(3)}%  ` +
      `baseline=${stats.baseline.meanPct.toFixed(3)}%  edge=${stats.edgePct.toFixed(3)}pp  ` +
      `p=${stats.pValue.toFixed(4)}  win=${stats.winRatePct.toFixed(1)}%`,
  );
  console.log(
    `  ci95=[${stats.meanCi95[0].toFixed(2)}, ${stats.meanCi95[1].toFixed(2)}]  ` +
      `grossEdge=${stats.grossEdgePct.toFixed(3)}pp  costDrag=${stats.costDragPct.toFixed(3)}pp  ` +
      `maxDD=${stats.maxDrawdownPct.toFixed(1)}%`,
  );
  console.log(`  VERDICT: ${conclusion.verdict} - ${conclusion.headline}`);
  const flags = guards.filter((g) => g.severity !== "info").map((g) => g.id);
  if (flags.length) console.log(`  guards: ${flags.join(", ")}`);
  console.log();
}

// 1. The obvious reading of the seed question, across thresholds.
for (const t of [-1, -2, -3, -4, -5]) {
  report(`single-day fall <= ${t}%, hold 5d`, baseSpec({
    signal: { kind: "single_day_return", thresholdPct: t },
  }));
}

// 2. Does the holding period change the answer?
for (const h of [1, 5, 10, 20, 60]) {
  report(`single-day fall <= -2%, hold ${h}d`, baseSpec({
    exit: { kind: "fixed_holding", holdingDays: h },
  }));
}

// 3. Other readings of "sharp fall".
report("5-day fall <= -5%, hold 10d", baseSpec({
  signal: { kind: "n_day_return", thresholdPct: -5, windowDays: 5 },
  exit: { kind: "fixed_holding", holdingDays: 10 },
}));

report("10% below 252d high, hold 20d", baseSpec({
  signal: { kind: "drawdown_from_high", thresholdPct: -10, lookbackDays: 252 },
  exit: { kind: "fixed_holding", holdingDays: 20 },
}));

// 4. The look-ahead version, to quantify how much "edge" it manufactures.
report("LOOK-AHEAD: same-close entry, -2%, hold 5d", baseSpec({
  entryTiming: "same_close",
}));

// 5. Crisis dependence.
report("-2%, hold 5d, excluding 2008 and 2020", baseSpec({
  filters: { allowOverlappingTrades: false, excludeYears: [2008, 2020] },
}));
