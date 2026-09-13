import { resolveProvider } from "@/llm/providers";
import { completeStructured } from "@/llm/structured";
import { extractionSchema, type Extraction } from "./schemas";

/**
 * ASK -> structured understanding.
 *
 * The model reads the sentence. It does not decide anything.
 */

const SYSTEM = `You are the interpretation stage of a trading-research tool.

Your only job is to read a user's question about markets and report, precisely,
what it does and does not specify. You are a careful reader, not an analyst.

Rules you must not break:
- Never invent a number the user did not state. If they did not give a
  percentage, a holding period, or a date range, the corresponding field is null.
  A null is the correct, useful answer - it is what triggers the system to ask.
- Never recommend a strategy, predict a market, or say whether an idea will work.
- "sharp", "big", "crash", "dip" and similar words are ALWAYS ambiguous. List
  them with at least two genuinely different readings a practitioner might mean.
- Only NIFTY50 is available. If the user asks about another instrument, an
  option strategy, or anything this cannot test, set isTestableHere to false and
  explain why in one sentence.

Return only JSON matching the requested shape.`;

function userPrompt(question: string): string {
  return `The user asked:

"""
${question}
"""

Report what this question specifies and what it leaves undefined.

Required JSON shape:
{
  "instrument": "NIFTY50" | null,
  "isTestableHere": boolean,
  "outOfScopeReason": string | null,
  "statedFallPct": number | null,        // negative, only if explicitly stated
  "statedFallWindowDays": integer | null,
  "statedHoldingDays": integer | null,
  "restatement": string,                  // the question, said precisely
  "hypothesis": string,                   // a falsifiable version of the claim
  "ambiguousTerms": [
    { "term": string, "whyAmbiguous": string, "readings": [string, string] }
  ]
}`;
}

export interface InterpretOutcome {
  extraction: Extraction;
  source: "llm" | "deterministic";
  provider?: string;
  model?: string;
  latencyMs?: number;
  repaired?: boolean;
  /** Populated when the LLM was configured but failed and we fell back. */
  fallbackReason?: string;
}

export async function interpret(question: string): Promise<InterpretOutcome> {
  const provider = resolveProvider();
  if (!provider) {
    return { extraction: deterministicExtract(question), source: "deterministic" };
  }

  try {
    const { value, result, repaired } = await completeStructured(
      provider,
      extractionSchema,
      { system: SYSTEM, user: userPrompt(question), temperature: 0.1, maxTokens: 1200 },
    );
    return {
      extraction: value,
      source: "llm",
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      repaired,
    };
  } catch (err) {
    // A research tool that breaks when a vendor has a bad minute is not a
    // research tool. Degrade, report the degradation, keep going.
    return {
      extraction: deterministicExtract(question),
      source: "deterministic",
      fallbackReason: (err as Error).message,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Deterministic path                                                  */
/* ------------------------------------------------------------------ */

const VAGUE_FALL_WORDS = [
  "sharp fall",
  "sharp drop",
  "big fall",
  "big drop",
  "crash",
  "sell-off",
  "selloff",
  "correction",
  "dip",
  "plunge",
  "slump",
];

/**
 * Runs when no API key is configured, or when the provider fails.
 *
 * This is intentionally unclever. It recognises the vocabulary of the problem
 * domain and is honest about the rest. It exists so that the product can be
 * cloned and run by a reviewer with no account anywhere, and so that a demo
 * never depends on someone else's uptime.
 */
export function deterministicExtract(question: string): Extraction {
  const q = question.toLowerCase();

  const mentionsNifty = /\bnifty\b|\bnse\b|\bindia\b/.test(q);
  const mentionsOtherInstrument =
    /\b(bank ?nifty|sensex|s&p|nasdaq|bitcoin|btc|option|futures on|reliance|tcs|infosys)\b/.test(q);

  // A percentage only counts as a "stated fall" if it sits near fall language.
  let statedFallPct: number | null = null;
  const pctMatch = q.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    const near = q.slice(Math.max(0, pctMatch.index! - 40), pctMatch.index! + 40);
    if (/fall|drop|down|decline|fell|crash|correct|lose|loss/.test(near)) {
      statedFallPct = -Math.abs(Number(pctMatch[1]));
    }
  }

  const holdMatch = q.match(
    /(?:hold(?:ing)?|keep|for)\s+(?:it\s+)?(\d+)\s*(day|days|week|weeks|month|months)/,
  );
  let statedHoldingDays: number | null = null;
  if (holdMatch) {
    const n = Number(holdMatch[1]);
    const unit = holdMatch[2];
    statedHoldingDays = unit.startsWith("week")
      ? n * 5
      : unit.startsWith("month")
        ? n * 21
        : n;
    if (statedHoldingDays > 250) statedHoldingDays = 250;
  }

  const windowMatch = q.match(/(?:over|within|in)\s+(\d+)\s*(day|days|week|weeks)/);
  const statedFallWindowDays = windowMatch
    ? Math.min(60, Number(windowMatch[1]) * (windowMatch[2].startsWith("week") ? 5 : 1))
    : null;

  const foundVague = VAGUE_FALL_WORDS.filter((w) => q.includes(w));

  const ambiguousTerms: Extraction["ambiguousTerms"] = [];

  if (foundVague.length && statedFallPct === null) {
    ambiguousTerms.push({
      term: foundVague[0],
      whyAmbiguous:
        "No size or timeframe is attached to it, and the answer changes completely depending on which is chosen.",
      readings: [
        "A single session closing down 2% or more",
        "A cumulative fall of 5% or more over about a week",
        "Trading 10% or more below the highest close of the past year",
      ],
    });
  }

  if (statedHoldingDays === null) {
    ambiguousTerms.push({
      term: "work",
      whyAmbiguous:
        "Whether the idea 'works' depends entirely on how long the position is held, and no holding period was given.",
      readings: [
        "Sell at the next session's close",
        "Hold for about a week",
        "Hold for a quarter",
      ],
    });
  }

  const isTestableHere = mentionsNifty || !mentionsOtherInstrument;

  return {
    instrument: isTestableHere ? "NIFTY50" : null,
    isTestableHere,
    outOfScopeReason: isTestableHere
      ? null
      : "This prototype only carries NIFTY 50 daily data, so it cannot test the instrument named in the question.",
    statedFallPct,
    statedFallWindowDays,
    statedHoldingDays,
    restatement: mentionsNifty
      ? "Does buying the NIFTY 50 index after it falls produce a better return than buying it at an arbitrary time?"
      : "Does buying an index after it falls produce a better return than buying it at an arbitrary time?",
    hypothesis:
      "Entering the NIFTY 50 after a defined fall produces a higher average return over a defined holding period than entering on an average session in the same period.",
    ambiguousTerms,
  };
}
