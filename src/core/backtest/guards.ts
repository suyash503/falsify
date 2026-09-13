import type { StrategySpec } from "../spec";
import type { BacktestRaw } from "./engine";
import type { BacktestStats } from "./stats";

/**
 * Guards turn "what could go wrong" from a paragraph in a document into code
 * that runs on every experiment and can veto the conclusion.
 *
 * The reasoning: a research tool that can only ever say "here are your returns"
 * will eventually convince its user of something false. The interesting work is
 * not computing the average - it is enumerating the reasons the average might
 * be a lie, and refusing to overstate the result when those reasons apply.
 */

export type Severity = "critical" | "warning" | "info";

export interface Guard {
  id: string;
  severity: Severity;
  title: string;
  /** Plain-language explanation aimed at a non-quant reader. */
  detail: string;
  /** What the user can actually do about it. */
  remedy?: string;
}

export interface GuardContext {
  /**
   * How many distinct specs have already been tested against this dataset in
   * the user's journal. Every extra variant raises the chance that the best
   * one looks good purely by luck.
   */
  variantsTestedInLineage: number;
  /** First session available in the dataset, for warm-up detection. */
  datasetStart: string;
}

const MIN_CREDIBLE_TRADES = 30;
const REGIME_CONCENTRATION_PCT = 30;
const MIN_TEST_YEARS = 3;

export function evaluateGuards(
  spec: StrategySpec,
  raw: BacktestRaw,
  stats: BacktestStats,
  ctx: GuardContext,
): Guard[] {
  const guards: Guard[] = [];

  /* ---- Critical: the result is not merely weak, it is invalid ---- */

  if (spec.entryTiming === "same_close") {
    guards.push({
      id: "LOOK_AHEAD_ENTRY",
      severity: "critical",
      title: "This result uses information that did not exist yet",
      detail:
        "The signal is measured at the closing price, and the trade is also entered at that same closing price. " +
        "In reality you cannot know the close until the session is over, by which point you can no longer trade at it. " +
        "Any edge shown here may be entirely an artefact of that impossibility.",
      remedy: "Switch entry to the next session's open.",
    });
  }

  if (stats.tradeCount === 0) {
    guards.push({
      id: "NO_TRADES",
      severity: "critical",
      title: "The condition never occurred",
      detail:
        "No session in the test period met this definition of a sharp fall, so there is nothing to measure. " +
        "This is itself a finding: the definition may be too strict to be useful.",
      remedy: "Loosen the threshold or widen the test period.",
    });
    return guards;
  }

  /* ---- Warnings: the result may be real but cannot carry much weight ---- */

  if (stats.tradeCount < MIN_CREDIBLE_TRADES) {
    guards.push({
      id: "SMALL_SAMPLE",
      severity: "warning",
      title: `Only ${stats.tradeCount} trades`,
      detail:
        `With fewer than ${MIN_CREDIBLE_TRADES} observations, the average is dominated by a handful of episodes. ` +
        "A single good or bad trade moves the headline number materially, so it cannot distinguish skill from luck.",
      remedy: "Loosen the threshold, or widen the test period, to gather more occurrences.",
    });
  }

  const yearEntries = Object.entries(stats.tradesByYear);
  const worstYear = yearEntries.sort((a, b) => b[1] - a[1])[0];
  if (worstYear) {
    const share = (worstYear[1] / stats.tradeCount) * 100;
    if (share > REGIME_CONCENTRATION_PCT) {
      guards.push({
        id: "REGIME_CONCENTRATION",
        severity: "warning",
        title: `${share.toFixed(0)}% of all trades happened in ${worstYear[0]}`,
        detail:
          `This is not really a test of "buying falls" - it is largely a test of what happened in ${worstYear[0]}. ` +
          "Sharp falls cluster inside crises, so the result may describe one specific market episode rather than a repeatable pattern.",
        remedy: `Re-run excluding ${worstYear[0]} and see whether the edge survives.`,
      });
    }
  }

  if (spec.filters.allowOverlappingTrades && stats.tradeCount > 1) {
    guards.push({
      id: "OVERLAPPING_TRADES",
      severity: "warning",
      title: "Trades overlap, so they are not independent",
      detail:
        "Several positions are open at once and share the same days of market movement. " +
        "The trade count therefore overstates how much independent evidence there actually is, which makes the significance test more optimistic than it should be.",
      remedy: "Disallow overlapping trades for a stricter reading.",
    });
  }

  if (stats.sameBarAmbiguityCount > 0) {
    const share = (stats.sameBarAmbiguityCount / stats.tradeCount) * 100;
    guards.push({
      id: "SAME_BAR_AMBIGUITY",
      severity: "warning",
      title: `${stats.sameBarAmbiguityCount} trades (${share.toFixed(0)}%) hit both target and stop on the same day`,
      detail:
        "Daily data records only the high and the low, not the order they occurred in. " +
        "For these trades we assumed the stop was hit first, which is the pessimistic reading. Intraday data would be required to resolve it properly.",
      remedy: "Widen the gap between target and stop, or use a time-based exit.",
    });
  }

  const startYear = Number(spec.testPeriod.start.slice(0, 4));
  const endYear = Number(spec.testPeriod.end.slice(0, 4));
  if (endYear - startYear < MIN_TEST_YEARS) {
    guards.push({
      id: "SHORT_TEST_PERIOD",
      severity: "warning",
      title: "Test period is shorter than a full market cycle",
      detail:
        `A window of roughly ${Math.max(1, endYear - startYear)} year(s) will contain one kind of market and not others. ` +
        "A dip-buying rule looks excellent in a recovery and terrible in a prolonged bear market.",
      remedy: "Extend the test period to cover at least one bull and one bear phase.",
    });
  }

  // A lookback-based signal cannot fire until it has a full window of history
  // behind it. If the test period starts at the edge of the dataset, the first
  // stretch is silently unusable - which quietly shortens the real test period.
  if (spec.signal.kind === "drawdown_from_high") {
    const warmupSessions = spec.signal.lookbackDays;
    const startsAtDatasetEdge = spec.testPeriod.start <= ctx.datasetStart;
    if (startsAtDatasetEdge && warmupSessions > 20) {
      guards.push({
        id: "LOOKBACK_WARMUP",
        severity: "info",
        title: `The first ~${warmupSessions} sessions cannot produce a signal`,
        detail:
          `Measuring distance from a ${warmupSessions}-session high requires ${warmupSessions} sessions of history first. ` +
          "Because the test period begins at the very start of the dataset, roughly that many sessions at the front are effectively excluded, making the real test window shorter than it appears.",
        remedy: "Start the test period later so the whole window is genuinely testable.",
      });
    }
  }

  if (ctx.variantsTestedInLineage > 1) {
    // Sidak-style adjustment: the chance that at least one of k independent
    // tests clears 5% by luck alone.
    const familywise =
      (1 - Math.pow(1 - 0.05, ctx.variantsTestedInLineage)) * 100;
    guards.push({
      id: "MULTIPLE_TESTING",
      severity: "warning",
      title: `${ctx.variantsTestedInLineage} variants have now been tested on the same data`,
      detail:
        `Testing many definitions against one dataset and keeping the best is how backtests get fooled. ` +
        `Across ${ctx.variantsTestedInLineage} attempts there is roughly a ${familywise.toFixed(0)}% chance that at least one clears the usual 5% significance bar purely by luck.`,
      remedy: "Hold out a period you have not looked at, and confirm the winner there before believing it.",
    });
  }

  if (stats.grossEdgePct > 0 && stats.edgePct <= 0) {
    guards.push({
      id: "COSTS_DOMINATE",
      severity: "warning",
      title: "There is a pattern, but costs consume all of it",
      detail:
        `Before costs the edge is ${stats.grossEdgePct.toFixed(2)} percentage points; after brokerage and slippage it is ${stats.edgePct.toFixed(2)}. ` +
        "The pattern may be real and still not be worth trading.",
      remedy: "Test a longer holding period so the fixed cost is spread over a larger move.",
    });
  }

  /* ---- Info: structural limits the user should know about regardless ---- */

  guards.push({
    id: "PRICE_INDEX_ONLY",
    severity: "info",
    title: "Dividends are not included",
    detail:
      "The NIFTY 50 price index excludes dividends, worth roughly 1-1.5% a year. Longer holding periods are therefore understated slightly, and the buy-and-hold comparison is a little harsher than reality.",
  });

  guards.push({
    id: "NOT_DIRECTLY_TRADABLE",
    severity: "info",
    title: "The index itself cannot be bought",
    detail:
      "Trading this would mean using a futures contract or an ETF, each of which adds tracking error, roll costs and a bid-ask spread beyond the slippage modelled here.",
  });

  if (raw.signalsSkippedNoRoom > 0) {
    guards.push({
      id: "TRUNCATED_TAIL",
      severity: "info",
      title: `${raw.signalsSkippedNoRoom} signals near the end of the data were dropped`,
      detail:
        "Their holding period would have run past the last available session. They were excluded rather than cut short, because a shortened trade measured over fewer days would bias the average.",
    });
  }

  return guards;
}

/* ------------------------------------------------------------------ */
/* Verdict                                                             */
/* ------------------------------------------------------------------ */

/**
 * Deliberately there is no "PROVEN" rung on this ladder.
 *
 * A single backtest on nineteen years of one index cannot establish that a
 * trading rule works. It can fail to find evidence, or it can find something
 * worth a second look. Offering a stronger word than that would be the most
 * dishonest thing this product could do.
 */
export type Verdict =
  | "INVALID"
  | "NO_EVIDENCE"
  | "WEAK_EVIDENCE"
  | "SUGGESTIVE";

export interface Conclusion {
  verdict: Verdict;
  headline: string;
  /** Why the system landed on this rung, in the system's own voice. */
  reasoning: string;
}

export function concludeFrom(
  stats: BacktestStats,
  guards: Guard[],
): Conclusion {
  const critical = guards.filter((g) => g.severity === "critical");
  const warnings = guards.filter((g) => g.severity === "warning");

  if (critical.length) {
    return {
      verdict: "INVALID",
      headline: "This experiment cannot be interpreted",
      reasoning: critical[0].detail,
    };
  }

  const edge = stats.edgePct;
  const p = stats.pValue;

  if (edge <= 0) {
    return {
      verdict: "NO_EVIDENCE",
      headline: "Buying the fall did worse than buying on any random day",
      reasoning:
        `After costs, these trades averaged ${stats.meanNetPct.toFixed(2)}% against ${stats.baseline.meanPct.toFixed(2)}% for the same rules applied on every session in the period. ` +
        "The condition did not improve on simply being invested.",
    };
  }

  if (p > 0.1) {
    return {
      verdict: "NO_EVIDENCE",
      headline: "The advantage is within the range of chance",
      reasoning:
        `The ${edge.toFixed(2)} percentage point advantage sounds real, but ${(p * 100).toFixed(0)}% of randomly-timed trade sets did at least as well. ` +
        "That is far too common an outcome to treat as evidence of anything.",
    };
  }

  if (p > 0.05 || warnings.length >= 2 || stats.tradeCount < MIN_CREDIBLE_TRADES) {
    return {
      verdict: "WEAK_EVIDENCE",
      headline: "There is a signal here, but it is not sturdy",
      reasoning:
        `The edge is ${edge.toFixed(2)} percentage points with a p-value of ${p.toFixed(3)}, ` +
        `but ${warnings.length} caveat${warnings.length === 1 ? "" : "s"} above limit how much weight it can carry.`,
    };
  }

  return {
    verdict: "SUGGESTIVE",
    headline: "Worth investigating further",
    reasoning:
      `An edge of ${edge.toFixed(2)} percentage points over ${stats.tradeCount} trades, with only ${(p * 100).toFixed(1)}% of random-timing sets matching it. ` +
      "That is enough to justify more work - an out-of-sample test, another index, a different period - and not enough to justify trading it.",
  };
}
