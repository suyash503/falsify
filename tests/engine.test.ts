import { describe, expect, it } from "vitest";
import type { Bar } from "@/core/bars";
import { parseBarsCsv } from "@/core/bars";
import {
  detectSignals,
  runBacktest,
  simulateTrade,
} from "@/core/backtest/engine";
import { summarize } from "@/core/backtest/stats";
import { concludeFrom, evaluateGuards } from "@/core/backtest/guards";
import type { StrategySpec } from "@/core/spec";

/**
 * Hand-built bars. Using a synthetic series rather than real data means every
 * expected value below can be derived by hand, so a failure points at the
 * engine rather than at a data revision.
 */
function bar(date: string, o: number, h: number, l: number, c: number): Bar {
  return { date, open: o, high: h, low: l, close: c, volume: 0 };
}

/** close: 100, 100, 95 (-5%), 96, 97, 98, 99, 100, 101, 102 */
const FIXTURE: Bar[] = [
  bar("2020-01-01", 100, 101, 99, 100),
  bar("2020-01-02", 100, 101, 99, 100),
  bar("2020-01-03", 99, 99, 94, 95), // -5% day
  bar("2020-01-06", 95, 97, 94, 96),
  bar("2020-01-07", 96, 98, 95, 97),
  bar("2020-01-08", 97, 99, 96, 98),
  bar("2020-01-09", 98, 100, 97, 99),
  bar("2020-01-10", 99, 101, 98, 100),
  bar("2020-01-13", 100, 102, 99, 101),
  bar("2020-01-14", 101, 103, 100, 102),
];

function spec(overrides: Partial<StrategySpec> = {}): StrategySpec {
  return {
    instrument: "NIFTY50",
    signal: { kind: "single_day_return", thresholdPct: -2 },
    entryTiming: "next_open",
    exit: { kind: "fixed_holding", holdingDays: 2 },
    testPeriod: { start: "2020-01-01", end: "2020-01-14" },
    costs: { brokerageBps: 0, slippageBps: 0 },
    filters: { allowOverlappingTrades: false, excludeYears: [] },
    hypothesis: "Test hypothesis for the unit suite.",
    ...overrides,
  };
}

describe("parseBarsCsv", () => {
  it("parses the frozen dataset shape", () => {
    const bars = parseBarsCsv(
      "date,open,high,low,close,volume\n2020-01-01,1,2,0.5,1.5,100\n",
    );
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({
      date: "2020-01-01",
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 100,
    });
  });

  it("rejects a dataset missing a required column", () => {
    expect(() => parseBarsCsv("date,open,high,low\n2020-01-01,1,2,0.5\n")).toThrow(
      /close/,
    );
  });
});

describe("detectSignals", () => {
  it("fires on a single-day fall at or beyond the threshold", () => {
    const hits = detectSignals(
      FIXTURE,
      { kind: "single_day_return", thresholdPct: -2 },
      0,
      FIXTURE.length - 1,
    );
    expect(hits).toEqual([2]);
  });

  it("does not fire when the fall is smaller than the threshold", () => {
    const hits = detectSignals(
      FIXTURE,
      { kind: "single_day_return", thresholdPct: -10 },
      0,
      FIXTURE.length - 1,
    );
    expect(hits).toEqual([]);
  });

  it("never uses a bar beyond the one it fires on", () => {
    // Truncating the series after the signal must not change the signal.
    const truncated = FIXTURE.slice(0, 3);
    const full = detectSignals(
      FIXTURE,
      { kind: "single_day_return", thresholdPct: -2 },
      0,
      2,
    );
    const short = detectSignals(
      truncated,
      { kind: "single_day_return", thresholdPct: -2 },
      0,
      2,
    );
    expect(short).toEqual(full);
  });

  it("measures an n-day fall across the whole window", () => {
    const hits = detectSignals(
      FIXTURE,
      { kind: "n_day_return", thresholdPct: -4, windowDays: 2 },
      0,
      FIXTURE.length - 1,
    );
    // Index 2 is 100 -> 95 (-5%). Index 3 is 100 -> 96, exactly -4%, which the
    // inclusive `<=` comparison also admits. Both are correct.
    expect(hits).toEqual([2, 3]);
  });

  it("measures drawdown against the trailing high", () => {
    const hits = detectSignals(
      FIXTURE,
      { kind: "drawdown_from_high", thresholdPct: -4.5, lookbackDays: 3 },
      0,
      FIXTURE.length - 1,
    );
    expect(hits).toEqual([2]); // 95 vs a rolling peak of 100
  });

  it("refuses to fire until a full lookback window of history exists", () => {
    // A "5-day high" computed from 3 days of data would be a 3-day high wearing
    // the wrong label, so the engine declines rather than approximating.
    const hits = detectSignals(
      FIXTURE,
      { kind: "drawdown_from_high", thresholdPct: -4.5, lookbackDays: 5 },
      0,
      2,
    );
    expect(hits).toEqual([]);
  });
});

describe("look-ahead protection", () => {
  it("enters at the NEXT session's open, not the signal bar", () => {
    const trade = simulateTrade(FIXTURE, 2, spec(), FIXTURE.length - 1)!;
    expect(trade.signalDate).toBe("2020-01-03");
    expect(trade.entryDate).toBe("2020-01-06");
    expect(trade.entryPrice).toBe(95); // open of 2020-01-06
  });

  it("same_close entry uses the signal bar's close - the diagnostic mode", () => {
    const trade = simulateTrade(
      FIXTURE,
      2,
      spec({ entryTiming: "same_close" }),
      FIXTURE.length - 1,
    )!;
    expect(trade.entryDate).toBe("2020-01-03");
    expect(trade.entryPrice).toBe(95); // close of the signal bar
  });

  it("flags same_close entry as a critical guard", () => {
    const s = spec({ entryTiming: "same_close" });
    const raw = runBacktest(FIXTURE, s);
    const stats = summarize(raw, s);
    const guards = evaluateGuards(s, raw, stats, { variantsTestedInLineage: 1, datasetStart: "2007-09-17" });
    expect(guards.some((g) => g.id === "LOOK_AHEAD_ENTRY")).toBe(true);
    expect(concludeFrom(stats, guards).verdict).toBe("INVALID");
  });
});

describe("holding period", () => {
  it("holds for exactly N sessions including the entry session", () => {
    const trade = simulateTrade(
      FIXTURE,
      2,
      spec({ exit: { kind: "fixed_holding", holdingDays: 2 } }),
      FIXTURE.length - 1,
    )!;
    expect(trade.entryDate).toBe("2020-01-06");
    expect(trade.exitDate).toBe("2020-01-07"); // 2 sessions
    expect(trade.barsHeld).toBe(2);
    expect(trade.exitPrice).toBe(97);
  });

  it("drops a trade whose holding period runs past the dataset", () => {
    const trade = simulateTrade(
      FIXTURE,
      2,
      spec({ exit: { kind: "fixed_holding", holdingDays: 50 } }),
      FIXTURE.length - 1,
    );
    expect(trade).toBeNull();
  });
});

describe("costs", () => {
  it("charges brokerage and slippage on both legs", () => {
    const free = simulateTrade(FIXTURE, 2, spec(), FIXTURE.length - 1)!;
    const charged = simulateTrade(
      FIXTURE,
      2,
      spec({ costs: { brokerageBps: 5, slippageBps: 10 } }),
      FIXTURE.length - 1,
    )!;

    expect(charged.grossReturnPct).toBeCloseTo(free.grossReturnPct, 10);
    // 15bps each way on a round trip is ~30bps of drag.
    expect(free.netReturnPct - charged.netReturnPct).toBeCloseTo(0.3, 1);
  });
});

describe("target / stop resolution", () => {
  const bars: Bar[] = [
    bar("2020-01-01", 100, 101, 99, 100),
    bar("2020-01-02", 100, 101, 99, 95), // -5% signal
    // Entry at 95. Target +5% = 99.75, stop -5% = 90.25. This bar reaches both.
    bar("2020-01-03", 95, 100, 90, 96),
    bar("2020-01-06", 96, 97, 95, 96),
  ];

  it("assumes the stop when a single bar spans both levels", () => {
    const s = spec({
      exit: { kind: "target_or_stop", holdingDays: 2, targetPct: 5, stopPct: -5 },
    });
    const trade = simulateTrade(bars, 1, s, bars.length - 1)!;
    expect(trade.sameBarAmbiguity).toBe(true);
    expect(trade.exitReason).toBe("stop");
    expect(trade.netReturnPct).toBeLessThan(0);
  });
});

describe("overlapping trades", () => {
  const choppy: Bar[] = [
    bar("2020-01-01", 100, 101, 99, 100),
    bar("2020-01-02", 100, 101, 94, 95), // signal
    bar("2020-01-03", 95, 96, 89, 90), // signal again, while still holding
    bar("2020-01-06", 90, 91, 89, 90),
    bar("2020-01-07", 90, 91, 89, 91),
    bar("2020-01-08", 91, 92, 90, 92),
  ];

  it("suppresses a second entry while a position is open", () => {
    const raw = runBacktest(choppy, spec({ testPeriod: { start: "2020-01-01", end: "2020-01-08" } }));
    expect(raw.signalsDetected).toBe(2);
    expect(raw.trades).toHaveLength(1);
    expect(raw.signalsSkippedOverlap).toBe(1);
  });

  it("allows both entries when overlap is permitted", () => {
    const raw = runBacktest(
      choppy,
      spec({
        testPeriod: { start: "2020-01-01", end: "2020-01-08" },
        filters: { allowOverlappingTrades: true, excludeYears: [] },
      }),
    );
    expect(raw.trades).toHaveLength(2);
    expect(raw.signalsSkippedOverlap).toBe(0);
  });
});

describe("baseline", () => {
  it("applies the same rules to every eligible session", () => {
    const raw = runBacktest(FIXTURE, spec());
    // Every bar that leaves room for a 2-session hold after a next-open entry.
    expect(raw.baselineReturnsPct.length).toBeGreaterThan(raw.trades.length);
    expect(raw.baselineGrossReturnsPct.length).toBe(raw.baselineReturnsPct.length);
  });

  it("charges the baseline the same costs as the strategy", () => {
    const s = spec({ costs: { brokerageBps: 5, slippageBps: 10 } });
    const raw = runBacktest(FIXTURE, s);
    for (let i = 0; i < raw.baselineReturnsPct.length; i++) {
      expect(raw.baselineReturnsPct[i]).toBeLessThan(
        raw.baselineGrossReturnsPct[i],
      );
    }
  });
});

describe("reproducibility", () => {
  it("returns an identical p-value for an identical spec", () => {
    const s = spec();
    const a = summarize(runBacktest(FIXTURE, s), s);
    const b = summarize(runBacktest(FIXTURE, s), s);
    expect(a.pValue).toBe(b.pValue);
    expect(a.meanCi95).toEqual(b.meanCi95);
  });
});

describe("verdict ladder", () => {
  it("reports NO_TRADES rather than inventing a result", () => {
    const s = spec({ signal: { kind: "single_day_return", thresholdPct: -50 } });
    const raw = runBacktest(FIXTURE, s);
    const stats = summarize(raw, s);
    const guards = evaluateGuards(s, raw, stats, { variantsTestedInLineage: 1, datasetStart: "2007-09-17" });
    expect(guards.some((g) => g.id === "NO_TRADES")).toBe(true);
    expect(concludeFrom(stats, guards).verdict).toBe("INVALID");
  });

  it("warns about multiple testing once several variants exist", () => {
    const s = spec();
    const raw = runBacktest(FIXTURE, s);
    const stats = summarize(raw, s);
    const guards = evaluateGuards(s, raw, stats, { variantsTestedInLineage: 6, datasetStart: "2007-09-17" });
    const mt = guards.find((g) => g.id === "MULTIPLE_TESTING");
    expect(mt).toBeDefined();
    expect(mt!.detail).toMatch(/26%/); // 1 - 0.95^6
  });

  it("has no rung stronger than SUGGESTIVE", () => {
    const s = spec();
    const raw = runBacktest(FIXTURE, s);
    const stats = summarize(raw, s);
    const guards = evaluateGuards(s, raw, stats, { variantsTestedInLineage: 1, datasetStart: "2007-09-17" });
    const { verdict } = concludeFrom(stats, guards);
    expect(["INVALID", "NO_EVIDENCE", "WEAK_EVIDENCE", "SUGGESTIVE"]).toContain(
      verdict,
    );
  });
});
