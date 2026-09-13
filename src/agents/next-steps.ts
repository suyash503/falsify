import type { BacktestStats } from "@/core/backtest/stats";
import type { Guard } from "@/core/backtest/guards";
import type { StrategySpec } from "@/core/spec";

/**
 * "What should we investigate next?" as data rather than prose.
 *
 * The brief asks the LEARN step to suggest follow-up questions. Suggesting them
 * in a paragraph is cheap; the useful version is a follow-up the user can run
 * in one click, which then becomes a child experiment in the journal with a
 * recorded lineage. That is how a pile of one-off backtests turns into a line
 * of enquiry.
 *
 * These are generated from the guards that actually fired, so the system
 * proposes tests of its own weaknesses rather than a fixed menu.
 */

export interface NextExperiment {
  id: string;
  question: string;
  whyItMatters: string;
  /** Applied on top of the parent spec to create the child experiment. */
  patch: Partial<StrategySpec>;
}

export function proposeNextExperiments(
  spec: StrategySpec,
  stats: BacktestStats,
  guards: Guard[],
): NextExperiment[] {
  const out: NextExperiment[] = [];
  const fired = new Set(guards.map((g) => g.id));

  // 1. Crisis dependence - the single most common reason a dip-buying result
  //    evaporates outside the sample.
  if (fired.has("REGIME_CONCENTRATION")) {
    const dominantYear = Object.entries(stats.tradesByYear).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    if (dominantYear) {
      out.push({
        id: "exclude-dominant-year",
        question: `Does this survive without ${dominantYear}?`,
        whyItMatters: `${dominantYear} supplied most of the trades. If the edge disappears once that year is removed, the finding describes one crisis rather than a repeatable pattern.`,
        patch: {
          filters: {
            ...spec.filters,
            excludeYears: [...spec.filters.excludeYears, Number(dominantYear)],
          },
        },
      });
    }
  }

  // 2. Out-of-sample split. Anything discovered on the full history has been
  //    fitted to all of it; the only honest check is data not yet looked at.
  const startYear = Number(spec.testPeriod.start.slice(0, 4));
  const endYear = Number(spec.testPeriod.end.slice(0, 4));
  const midYear = Math.floor((startYear + endYear) / 2);
  if (endYear - startYear >= 6) {
    out.push({
      id: "out-of-sample-second-half",
      question: `Does it hold up on ${midYear} onwards alone?`,
      whyItMatters:
        "Splitting the history and confirming the result on the later half is the cheapest available defence against having fitted the rule to the past.",
      patch: {
        testPeriod: { start: `${midYear}-01-01`, end: spec.testPeriod.end },
      },
    });
  }

  // 3. Horizon sensitivity. If the answer flips with the holding period, the
  //    original question was underspecified rather than answered.
  const currentHold = spec.exit.holdingDays;
  const altHold = currentHold <= 5 ? 20 : currentHold <= 20 ? 60 : 5;
  out.push({
    id: `holding-${altHold}`,
    question: `What happens over ${altHold} sessions instead of ${currentHold}?`,
    whyItMatters:
      "A result that reverses when the horizon changes is not a finding about falls - it is a finding about how long you happened to stay invested.",
    patch: {
      exit:
        spec.exit.kind === "fixed_holding"
          ? { kind: "fixed_holding", holdingDays: altHold }
          : { ...spec.exit, holdingDays: altHold },
    },
  });

  // 4. Threshold sensitivity, aimed at whichever problem is live.
  if (spec.signal.kind === "single_day_return") {
    const current = spec.signal.thresholdPct;
    const looser = Math.min(-1, current + 1);
    const stricter = Math.max(-8, current - 1);
    const target = fired.has("SMALL_SAMPLE") ? looser : stricter;
    if (target !== current) {
      out.push({
        id: `threshold-${target}`,
        question: `Does a ${Math.abs(target)}% threshold change the picture?`,
        whyItMatters: fired.has("SMALL_SAMPLE")
          ? "A looser definition gathers more occurrences, which is the only way to tell a real effect from a small-sample accident."
          : "If the edge only appears at one exact threshold and vanishes on either side, that is a fingerprint of curve-fitting rather than a real effect.",
        patch: {
          signal: { kind: "single_day_return", thresholdPct: target },
        },
      });
    }
  }

  // 5. Cost sensitivity, only when costs are what killed it.
  if (fired.has("COSTS_DOMINATE")) {
    out.push({
      id: "longer-hold-for-costs",
      question: "Does a longer hold let the move outgrow the costs?",
      whyItMatters:
        "The round-trip cost is fixed per trade. Spreading it over a larger expected move is the only way a small edge survives it.",
      patch: {
        exit:
          spec.exit.kind === "fixed_holding"
            ? { kind: "fixed_holding", holdingDays: Math.min(250, currentHold * 4) }
            : { ...spec.exit, holdingDays: Math.min(250, currentHold * 4) },
      },
    });
  }

  // 6. The look-ahead demonstration. Worth offering once, because seeing the
  //    number move is more convincing than being told the rule exists.
  if (spec.entryTiming === "next_open" && !fired.has("LOOK_AHEAD_ENTRY")) {
    out.push({
      id: "show-look-ahead",
      question: "How much 'edge' appears if we cheat and buy at the same close?",
      whyItMatters:
        "Running the impossible version shows how much apparent performance comes purely from using information that did not exist yet. It is marked invalid on purpose.",
      patch: { entryTiming: "same_close" },
    });
  }

  return out.slice(0, 4);
}
