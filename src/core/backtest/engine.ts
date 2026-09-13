import type { Bar } from "../bars";
import type { ExitRule, Signal, StrategySpec } from "../spec";

/**
 * The backtest engine.
 *
 * Three rules govern everything in this file:
 *
 * 1. A signal may only use information available at or before the close of the
 *    bar on which it fires. No exceptions, no "just this once".
 * 2. Execution happens strictly after the information that triggered it.
 * 3. Anything the daily data cannot resolve is resolved *against* the strategy
 *    and reported, never quietly resolved in its favour.
 */

export type ExitReason = "target" | "stop" | "time";

export interface Trade {
  signalDate: string;
  signalIndex: number;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  /** Before costs. */
  grossReturnPct: number;
  /** After brokerage and slippage on both legs. This is the honest number. */
  netReturnPct: number;
  barsHeld: number;
  exitReason: ExitReason;
  /**
   * Target and stop were both reachable inside one session. Daily OHLC cannot
   * tell us which came first, so we assumed the stop. Counted and surfaced.
   */
  sameBarAmbiguity: boolean;
}

export interface BacktestRaw {
  trades: Trade[];
  /** Signals that met the condition inside the test window. */
  signalsDetected: number;
  /** Rejected because a position was already open and overlap was disallowed. */
  signalsSkippedOverlap: number;
  /** Rejected because the holding period ran past the end of the dataset. */
  signalsSkippedNoRoom: number;
  /** Rejected by the year-exclusion filter. */
  signalsSkippedFiltered: number;
  /**
   * The unconditional comparison set: the same trade rules applied to *every*
   * eligible session in the window, signal or not. This is what turns "+1.2%"
   * into "+1.2% versus +0.9% for doing it on any random day".
   */
  baselineReturnsPct: number[];
  /** Same set before costs, so "no edge" can be told apart from "edge eaten by costs". */
  baselineGrossReturnsPct: number[];
  /** Sessions in the test window, for time-in-market maths. */
  windowBars: number;
}

/** One-way cost as a fraction of price. */
function oneWayCost(spec: StrategySpec): number {
  return (spec.costs.brokerageBps + spec.costs.slippageBps) / 10_000;
}

/**
 * Indices of bars whose CLOSE satisfies the condition, using only bars at or
 * before that index.
 */
export function detectSignals(
  bars: Bar[],
  signal: Signal,
  from: number,
  to: number,
): number[] {
  const hits: number[] = [];

  for (let i = Math.max(from, 1); i <= to; i++) {
    switch (signal.kind) {
      case "single_day_return": {
        const r = (bars[i].close / bars[i - 1].close - 1) * 100;
        if (r <= signal.thresholdPct) hits.push(i);
        break;
      }
      case "n_day_return": {
        const back = i - signal.windowDays;
        if (back < 0) continue;
        const r = (bars[i].close / bars[back].close - 1) * 100;
        if (r <= signal.thresholdPct) hits.push(i);
        break;
      }
      case "drawdown_from_high": {
        const start = i - signal.lookbackDays + 1;
        if (start < 0) continue;
        let peak = -Infinity;
        for (let k = start; k <= i; k++) {
          if (bars[k].close > peak) peak = bars[k].close;
        }
        const dd = (bars[i].close / peak - 1) * 100;
        if (dd <= signal.thresholdPct) hits.push(i);
        break;
      }
    }
  }
  return hits;
}

function holdingDaysOf(exit: ExitRule): number {
  return exit.holdingDays;
}

/**
 * Simulate a single trade triggered by a signal at `signalIndex`.
 * Returns null when the holding period does not fit inside the dataset - we
 * drop such trades rather than truncating them, because a truncated trade is a
 * trade measured over a shorter horizon and would bias the average.
 */
export function simulateTrade(
  bars: Bar[],
  signalIndex: number,
  spec: StrategySpec,
  lastUsableIndex: number,
): Trade | null {
  const entryIndex =
    spec.entryTiming === "next_open" ? signalIndex + 1 : signalIndex;
  if (entryIndex > lastUsableIndex) return null;

  const entryPrice =
    spec.entryTiming === "next_open"
      ? bars[entryIndex].open
      : bars[entryIndex].close;

  const holding = holdingDaysOf(spec.exit);
  const finalIndex = entryIndex + holding - 1;
  if (finalIndex > lastUsableIndex) return null;

  // When entering at the close, that session's range is already history, so
  // intrabar levels can only be evaluated from the following session.
  const scanFrom = spec.entryTiming === "next_open" ? entryIndex : entryIndex + 1;

  let exitIndex = finalIndex;
  let exitPrice = bars[finalIndex].close;
  let exitReason: ExitReason = "time";
  let sameBarAmbiguity = false;

  if (spec.exit.kind === "target_or_stop") {
    const targetLevel = entryPrice * (1 + spec.exit.targetPct / 100);
    const stopLevel = entryPrice * (1 + spec.exit.stopPct / 100);

    for (let k = scanFrom; k <= finalIndex; k++) {
      const hitStop = bars[k].low <= stopLevel;
      const hitTarget = bars[k].high >= targetLevel;
      if (!hitStop && !hitTarget) continue;

      if (hitStop && hitTarget) {
        // Unknowable from daily bars. Assume the worse of the two.
        sameBarAmbiguity = true;
        exitIndex = k;
        exitPrice = stopLevel;
        exitReason = "stop";
      } else if (hitStop) {
        exitIndex = k;
        exitPrice = stopLevel;
        exitReason = "stop";
      } else {
        exitIndex = k;
        exitPrice = targetLevel;
        exitReason = "target";
      }
      break;
    }
  }

  const cost = oneWayCost(spec);
  const effectiveEntry = entryPrice * (1 + cost);
  const effectiveExit = exitPrice * (1 - cost);

  return {
    signalDate: bars[signalIndex].date,
    signalIndex,
    entryDate: bars[entryIndex].date,
    exitDate: bars[exitIndex].date,
    entryPrice,
    exitPrice,
    grossReturnPct: (exitPrice / entryPrice - 1) * 100,
    netReturnPct: (effectiveExit / effectiveEntry - 1) * 100,
    barsHeld: exitIndex - entryIndex + 1,
    exitReason,
    sameBarAmbiguity,
  };
}

export function runBacktest(bars: Bar[], spec: StrategySpec): BacktestRaw {
  // Resolve the test window. Signals may look back before `from`, which is
  // legitimate: that data was genuinely available at the time.
  let from = bars.findIndex((b) => b.date >= spec.testPeriod.start);
  if (from === -1) from = bars.length;
  let to = bars.length - 1;
  while (to >= 0 && bars[to].date > spec.testPeriod.end) to--;

  if (from > to) {
    return {
      trades: [],
      signalsDetected: 0,
      signalsSkippedOverlap: 0,
      signalsSkippedNoRoom: 0,
      signalsSkippedFiltered: 0,
      baselineReturnsPct: [],
      baselineGrossReturnsPct: [],
      windowBars: 0,
    };
  }

  const excluded = new Set(spec.filters.excludeYears);
  const rawSignals = detectSignals(bars, spec.signal, from, to);

  let signalsSkippedFiltered = 0;
  const signals = rawSignals.filter((i) => {
    if (excluded.has(Number(bars[i].date.slice(0, 4)))) {
      signalsSkippedFiltered++;
      return false;
    }
    return true;
  });

  const trades: Trade[] = [];
  let signalsSkippedOverlap = 0;
  let signalsSkippedNoRoom = 0;
  let openUntilIndex = -1;

  for (const signalIndex of signals) {
    if (!spec.filters.allowOverlappingTrades && signalIndex <= openUntilIndex) {
      signalsSkippedOverlap++;
      continue;
    }
    const trade = simulateTrade(bars, signalIndex, spec, to);
    if (!trade) {
      signalsSkippedNoRoom++;
      continue;
    }
    trades.push(trade);
    openUntilIndex = trade.signalIndex + trade.barsHeld;
  }

  // Baseline: identical rules, every eligible session. Using the same exit
  // logic and the same costs is the whole point - otherwise we would be
  // comparing a cost-charged strategy against a cost-free benchmark and
  // manufacturing a deficit.
  const baselineReturnsPct: number[] = [];
  const baselineGrossReturnsPct: number[] = [];
  for (let i = from; i <= to; i++) {
    if (excluded.has(Number(bars[i].date.slice(0, 4)))) continue;
    const t = simulateTrade(bars, i, spec, to);
    if (t) {
      baselineReturnsPct.push(t.netReturnPct);
      baselineGrossReturnsPct.push(t.grossReturnPct);
    }
  }

  return {
    trades,
    signalsDetected: signals.length,
    signalsSkippedOverlap,
    signalsSkippedNoRoom,
    signalsSkippedFiltered,
    baselineReturnsPct,
    baselineGrossReturnsPct,
    windowBars: to - from + 1,
  };
}
