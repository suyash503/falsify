import type { BacktestRaw, Trade } from "./engine";
import type { StrategySpec } from "../spec";
import { specFingerprint } from "../spec";

/* ------------------------------------------------------------------ */
/* Descriptive helpers                                                 */
/* ------------------------------------------------------------------ */

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / (xs.length - 1));
}

/** Percentile of an already-sorted array, linear interpolation. */
function quantileSorted(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/* ------------------------------------------------------------------ */
/* Deterministic RNG                                                   */
/* ------------------------------------------------------------------ */

/**
 * A backtest that reports a different p-value on every page refresh is not
 * reproducible, and a research tool that is not reproducible is worthless. The
 * seed is derived from the spec, so an identical experiment always yields an
 * identical significance number - and a *changed* experiment honestly yields a
 * new one.
 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromSpec(spec: StrategySpec): number {
  return parseInt(specFingerprint(spec), 16) >>> 0;
}

/**
 * Circular block bootstrap.
 *
 * A plain i.i.d. bootstrap would be wrong here. The baseline set contains
 * *overlapping* forward returns - the 5-day return starting Monday shares four
 * days with the one starting Tuesday - so consecutive values are strongly
 * correlated. Resampling them independently pretends we have far more
 * independent observations than we do, which shrinks the null distribution and
 * turns noise into a "significant" result. Sampling contiguous blocks keeps
 * that correlation intact.
 */
function blockBootstrapMeans(
  source: number[],
  drawSize: number,
  blockLength: number,
  iterations: number,
  rand: () => number,
): number[] {
  const n = source.length;
  if (n === 0 || drawSize === 0) return [];
  const block = Math.max(1, Math.min(blockLength, n));
  const blocksNeeded = Math.ceil(drawSize / block);
  const means: number[] = new Array(iterations);

  for (let it = 0; it < iterations; it++) {
    let sum = 0;
    let taken = 0;
    for (let b = 0; b < blocksNeeded && taken < drawSize; b++) {
      const start = Math.floor(rand() * n);
      for (let k = 0; k < block && taken < drawSize; k++) {
        sum += source[(start + k) % n];
        taken++;
      }
    }
    means[it] = sum / taken;
  }
  return means;
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

export interface EquityPoint {
  date: string;
  equity: number;
}

/**
 * Both return distributions, binned on a shared scale.
 *
 * Persisted with the result because the raw baseline series runs to thousands
 * of values. Binning it here keeps the stored record small while keeping the
 * comparison chart honest - it draws the real shape of both samples rather
 * than a curve reconstructed from summary statistics.
 */
export interface ReturnHistogram {
  /** Lower edge of each bin, plus a final upper edge. */
  binEdges: number[];
  /** Share of the strategy's trades in each bin, as a percentage. */
  strategy: number[];
  /** Share of the baseline's observations in each bin, as a percentage. */
  baseline: number[];
  /** Values outside the clipped window are folded into the end bins. */
  clipped: boolean;
}

/**
 * Bin count follows the smaller sample, not the larger one. With 124 trades
 * spread over 36 bins the strategy series becomes a comb of noise that reads as
 * structure; the square-root rule keeps the shape legible without smoothing
 * away a genuinely small sample.
 */
function binCountFor(sampleSize: number): number {
  return Math.max(12, Math.min(36, Math.round(Math.sqrt(sampleSize) * 2)));
}

function buildHistogram(
  strategy: number[],
  baseline: number[],
): ReturnHistogram {
  const combined = [...strategy, ...baseline].sort((a, b) => a - b);
  if (!combined.length) {
    return { binEdges: [], strategy: [], baseline: [], clipped: false };
  }

  const HISTOGRAM_BINS = binCountFor(Math.max(1, strategy.length));

  // Clip the window to the 1st-99th percentile so a single 2008 outlier does
  // not flatten the chart. Nothing is discarded: out-of-window values land in
  // the end bins, and `clipped` tells the UI to label them "or worse".
  const lo = Math.min(quantileSorted(combined, 0.01), -0.5);
  const hi = Math.max(quantileSorted(combined, 0.99), 0.5);
  const width = (hi - lo) / HISTOGRAM_BINS || 1;

  const binEdges = Array.from({ length: HISTOGRAM_BINS + 1 }, (_, i) => lo + i * width);

  const shares = (xs: number[]) => {
    const counts = new Array<number>(HISTOGRAM_BINS).fill(0);
    for (const x of xs) {
      const idx = Math.min(
        HISTOGRAM_BINS - 1,
        Math.max(0, Math.floor((x - lo) / width)),
      );
      counts[idx]++;
    }
    return xs.length ? counts.map((c) => (c / xs.length) * 100) : counts;
  };

  return {
    binEdges,
    strategy: shares(strategy),
    baseline: shares(baseline),
    clipped: combined[0] < lo || combined[combined.length - 1] > hi,
  };
}

export interface BacktestStats {
  tradeCount: number;
  winRatePct: number;
  meanNetPct: number;
  medianNetPct: number;
  stdDevPct: number;
  bestPct: number;
  worstPct: number;
  meanGrossPct: number;
  /** Percentage points of return consumed by brokerage and slippage. */
  costDragPct: number;

  baseline: {
    /** Mean net return of the same rules applied on every eligible session. */
    meanPct: number;
    winRatePct: number;
    sampleSize: number;
  };

  /** meanNetPct - baseline.meanPct. The only number that answers "does it work?" */
  edgePct: number;
  /** Same comparison before costs, to separate "no edge" from "edge eaten by costs". */
  grossEdgePct: number;
  /**
   * One-sided bootstrap p-value: the probability of seeing an average this
   * good, or better, from the same number of randomly-timed trades.
   */
  pValue: number;
  /** 95% percentile-bootstrap interval for the strategy's mean return. */
  meanCi95: [number, number];

  equityCurve: EquityPoint[];
  /** Real binned shape of both samples, for the comparison chart. */
  returnHistogram: ReturnHistogram;
  maxDrawdownPct: number;
  timeInMarketPct: number;

  exitBreakdown: { target: number; stop: number; time: number };
  sameBarAmbiguityCount: number;
  /** Trades per calendar year - used to detect single-crisis dependence. */
  tradesByYear: Record<string, number>;

  bootstrapIterations: number;
}

const BOOTSTRAP_ITERATIONS = 4000;

export function summarize(raw: BacktestRaw, spec: StrategySpec): BacktestStats {
  const { trades, baselineReturnsPct } = raw;
  const net = trades.map((t) => t.netReturnPct);
  const gross = trades.map((t) => t.grossReturnPct);

  const meanNetPct = mean(net);
  const meanGrossPct = mean(gross);
  const baselineMean = mean(baselineReturnsPct);
  const baselineGrossMean = mean(raw.baselineGrossReturnsPct);

  const perTradeCostDrag = meanGrossPct - meanNetPct;

  const rand = mulberry32(seedFromSpec(spec));
  const holding = spec.exit.holdingDays;

  // Null distribution: same number of trades, randomly timed.
  const nullMeans = blockBootstrapMeans(
    baselineReturnsPct,
    net.length,
    holding,
    BOOTSTRAP_ITERATIONS,
    rand,
  );
  let atLeastAsGood = 0;
  for (const m of nullMeans) if (m >= meanNetPct) atLeastAsGood++;
  // +1 smoothing: with 4000 draws we can never honestly claim p = 0.
  const pValue = net.length
    ? (atLeastAsGood + 1) / (nullMeans.length + 1)
    : 1;

  // Confidence interval for the strategy's own mean.
  const stratBlock = spec.filters.allowOverlappingTrades ? holding : 1;
  const stratMeans = blockBootstrapMeans(
    net,
    net.length,
    stratBlock,
    BOOTSTRAP_ITERATIONS,
    rand,
  ).sort((a, b) => a - b);
  const meanCi95: [number, number] = stratMeans.length
    ? [quantileSorted(stratMeans, 0.025), quantileSorted(stratMeans, 0.975)]
    : [0, 0];

  // Equity curve, compounding trades in chronological order.
  const equityCurve: EquityPoint[] = [];
  let equity = 100;
  let peak = 100;
  let maxDrawdownPct = 0;
  if (trades.length) {
    equityCurve.push({ date: trades[0].entryDate, equity: 100 });
  }
  for (const t of trades) {
    equity *= 1 + t.netReturnPct / 100;
    if (equity > peak) peak = equity;
    const dd = (equity / peak - 1) * 100;
    if (dd < maxDrawdownPct) maxDrawdownPct = dd;
    equityCurve.push({ date: t.exitDate, equity });
  }

  const exitBreakdown = { target: 0, stop: 0, time: 0 };
  const tradesByYear: Record<string, number> = {};
  let sameBarAmbiguityCount = 0;
  let barsHeldTotal = 0;
  for (const t of trades) {
    exitBreakdown[t.exitReason]++;
    const y = t.entryDate.slice(0, 4);
    tradesByYear[y] = (tradesByYear[y] ?? 0) + 1;
    if (t.sameBarAmbiguity) sameBarAmbiguityCount++;
    barsHeldTotal += t.barsHeld;
  }

  const wins = net.filter((r) => r > 0).length;
  const baselineWins = baselineReturnsPct.filter((r) => r > 0).length;

  return {
    tradeCount: trades.length,
    winRatePct: net.length ? (wins / net.length) * 100 : 0,
    meanNetPct,
    medianNetPct: median(net),
    stdDevPct: stdDev(net),
    bestPct: net.length ? Math.max(...net) : 0,
    worstPct: net.length ? Math.min(...net) : 0,
    meanGrossPct,
    costDragPct: perTradeCostDrag,

    baseline: {
      meanPct: baselineMean,
      winRatePct: baselineReturnsPct.length
        ? (baselineWins / baselineReturnsPct.length) * 100
        : 0,
      sampleSize: baselineReturnsPct.length,
    },

    edgePct: meanNetPct - baselineMean,
    grossEdgePct: meanGrossPct - baselineGrossMean,
    pValue,
    meanCi95,

    equityCurve,
    returnHistogram: buildHistogram(net, baselineReturnsPct),
    maxDrawdownPct,
    timeInMarketPct: raw.windowBars
      ? Math.min(100, (barsHeldTotal / raw.windowBars) * 100)
      : 0,

    exitBreakdown,
    sameBarAmbiguityCount,
    tradesByYear,
    bootstrapIterations: BOOTSTRAP_ITERATIONS,
  };
}

export type { Trade };
