import { resolveProvider } from "@/llm/providers";
import { completeStructured } from "@/llm/structured";
import type { BacktestStats } from "@/core/backtest/stats";
import type { Conclusion, Guard } from "@/core/backtest/guards";
import { describeEntry, describeExit, describeSignal, type StrategySpec } from "@/core/spec";
import { narrationSchema, type Narration } from "./schemas";

/**
 * LEARN -> plain English.
 *
 * The narrator is handed a verdict that deterministic code has already reached
 * and a set of numbers it did not compute. It writes prose. It cannot promote
 * "no evidence" into "promising", because it is never asked what the verdict
 * should be - only how to say it.
 *
 * This is the safeguard against the most likely way an AI research assistant
 * does damage: sounding confident about a result that does not support it.
 */

const SYSTEM = `You explain the result of a completed trading backtest to an intelligent person who is not a quant.

You will be given statistics that have already been computed and a verdict that has already been decided by deterministic statistical code.

Absolute rules:
- The verdict is fixed. Express it. Never argue with it, soften it, or strengthen it. If the verdict is NO_EVIDENCE, your conclusion must read as no evidence - not as "promising but early".
- Use only the numbers provided. Never compute, estimate, extrapolate or invent a figure.
- "whatTheDataShows" must contain only observations. No causal claims, no "because", no forecasting, no advice.
- "whatWeConclude" is interpretation, and must agree with the verdict.
- "whatWeCannotSay" must name the specific wrong conclusions a reader might draw from these exact numbers.
- Never tell the user to trade anything. This is a research tool, not advice.
- Plain language. No jargon without explanation. Short sentences.

Return only JSON.`;

function factSheet(
  spec: StrategySpec,
  stats: BacktestStats,
  guards: Guard[],
  conclusion: Conclusion,
): string {
  const warnings = guards.filter((g) => g.severity !== "info");
  return `EXPERIMENT
Condition: ${describeSignal(spec.signal)}
Entry: ${describeEntry(spec.entryTiming)}
Exit: ${describeExit(spec.exit)}
Period: ${spec.testPeriod.start} to ${spec.testPeriod.end}
Costs: ${spec.costs.brokerageBps} bps brokerage + ${spec.costs.slippageBps} bps slippage each way

RESULTS (all already computed - use verbatim, do not recalculate)
Trades: ${stats.tradeCount}
Average return per trade after costs: ${stats.meanNetPct.toFixed(2)}%
Median return per trade: ${stats.medianNetPct.toFixed(2)}%
Win rate: ${stats.winRatePct.toFixed(1)}%
Best trade: ${stats.bestPct.toFixed(2)}%   Worst trade: ${stats.worstPct.toFixed(2)}%

BASELINE - the identical rules applied to every session in the period, not just after falls
Baseline average return: ${stats.baseline.meanPct.toFixed(2)}%
Baseline win rate: ${stats.baseline.winRatePct.toFixed(1)}%
Baseline sample size: ${stats.baseline.sampleSize}

COMPARISON
Edge over baseline: ${stats.edgePct.toFixed(2)} percentage points
Edge before costs: ${stats.grossEdgePct.toFixed(2)} percentage points
Costs consumed per trade: ${stats.costDragPct.toFixed(2)} percentage points
Bootstrap p-value: ${stats.pValue.toFixed(3)} (the share of randomly-timed trade sets that did at least as well, from ${stats.bootstrapIterations} resamples)
95% confidence interval for the average trade: ${stats.meanCi95[0].toFixed(2)}% to ${stats.meanCi95[1].toFixed(2)}%
Worst peak-to-trough fall of the strategy: ${stats.maxDrawdownPct.toFixed(1)}%

VERDICT (fixed - express this, do not revisit it)
${conclusion.verdict}: ${conclusion.headline}
Reasoning already established: ${conclusion.reasoning}

CAVEATS RAISED BY THE SYSTEM
${warnings.length ? warnings.map((g) => `- ${g.title}: ${g.detail}`).join("\n") : "- None beyond the structural limits of the data."}`;
}

export interface NarrateOutcome {
  narration: Narration;
  source: "llm" | "deterministic";
  provider?: string;
  model?: string;
  latencyMs?: number;
  fallbackReason?: string;
}

export async function narrate(
  spec: StrategySpec,
  stats: BacktestStats,
  guards: Guard[],
  conclusion: Conclusion,
): Promise<NarrateOutcome> {
  const provider = resolveProvider();
  if (!provider) {
    return {
      narration: deterministicNarration(spec, stats, guards, conclusion),
      source: "deterministic",
    };
  }

  try {
    const { value, result } = await completeStructured(provider, narrationSchema, {
      system: SYSTEM,
      user:
        factSheet(spec, stats, guards, conclusion) +
        `\n\nReturn JSON:\n{\n  "whatTheDataShows": [string],\n  "whatWeConclude": string,\n  "whatWeCannotSay": [string]\n}`,
      temperature: 0.3,
      maxTokens: 1200,
    });
    return {
      narration: value,
      source: "llm",
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
    };
  } catch (err) {
    return {
      narration: deterministicNarration(spec, stats, guards, conclusion),
      source: "deterministic",
      fallbackReason: (err as Error).message,
    };
  }
}

/* ------------------------------------------------------------------ */

/**
 * Template-driven narration from the same fact sheet. Less fluent than the
 * model, equally correct - which is the priority ordering this product needs.
 */
export function deterministicNarration(
  spec: StrategySpec,
  stats: BacktestStats,
  guards: Guard[],
  conclusion: Conclusion,
): Narration {
  if (stats.tradeCount === 0) {
    return {
      whatTheDataShows: [
        `The condition "${describeSignal(spec.signal)}" never occurred between ${spec.testPeriod.start} and ${spec.testPeriod.end}.`,
      ],
      whatWeConclude: conclusion.reasoning,
      whatWeCannotSay: [
        "That the idea is wrong. It was never tested, because the trigger never fired.",
      ],
    };
  }

  const direction = stats.edgePct >= 0 ? "better" : "worse";

  const shows = [
    `The condition occurred ${stats.tradeCount} times between ${spec.testPeriod.start} and ${spec.testPeriod.end}.`,
    `Those trades returned ${stats.meanNetPct.toFixed(2)}% on average after costs, and ${stats.winRatePct.toFixed(0)}% of them were profitable.`,
    `The same rules applied to every session in the period - not just the ones after a fall - returned ${stats.baseline.meanPct.toFixed(2)}%.`,
    `That makes the fall-based entry ${Math.abs(stats.edgePct).toFixed(2)} percentage points ${direction} than entering at an arbitrary time.`,
    `Out of ${stats.bootstrapIterations} randomly-timed sets of ${stats.tradeCount} trades, ${(stats.pValue * 100).toFixed(0)}% did at least as well.`,
  ];

  const cannot = [
    "That this predicts what will happen next. A backtest describes one past sequence on one index; it does not forecast.",
    `That the average is a reliable estimate. Individual trades ranged from ${stats.worstPct.toFixed(1)}% to ${stats.bestPct.toFixed(1)}%, so the average hides a wide spread.`,
  ];

  if (guards.some((g) => g.id === "REGIME_CONCENTRATION")) {
    cannot.push(
      "That this describes normal markets. Most of these trades came from a single turbulent year.",
    );
  }
  if (stats.edgePct > 0 && stats.pValue > 0.1) {
    cannot.push(
      "That the positive edge is real. An advantage this size appears routinely by chance alone at this sample size.",
    );
  }

  return {
    whatTheDataShows: shows,
    whatWeConclude: `${conclusion.headline}. ${conclusion.reasoning}`,
    whatWeCannotSay: cannot.slice(0, 4),
  };
}
