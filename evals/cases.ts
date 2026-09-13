import type { Extraction } from "@/agents/schemas";

/**
 * The golden set for the interpretation stage.
 *
 * This is the contract the ASK step has to satisfy, and it is written against
 * the behaviour that actually matters rather than against exact wording. The
 * most important checks are the *negative* ones: that the reader reports a null
 * when the user did not state something. A model that helpfully fills in
 * "-2%" because it knows that is a common threshold has silently made the
 * user's decision for them, and no amount of downstream honesty repairs that.
 *
 * Both the language-model path and the rule-based fallback are scored against
 * this same set, so the fallback cannot quietly rot while nobody is looking.
 */

export interface EvalCheck {
  name: string;
  check: (e: Extraction) => boolean;
}

export interface EvalCase {
  id: string;
  question: string;
  /** Why this case exists - printed in the report next to any failure. */
  rationale: string;
  checks: EvalCheck[];
}

const noInventedNumbers: EvalCheck = {
  name: "invents no numbers",
  check: (e) =>
    e.statedFallPct === null &&
    e.statedHoldingDays === null &&
    e.statedFallWindowDays === null,
};

const flagsAmbiguity: EvalCheck = {
  name: "flags at least one ambiguous term",
  check: (e) => e.ambiguousTerms.length >= 1,
};

const offersRealAlternatives: EvalCheck = {
  name: "each ambiguous term offers >= 2 distinct readings",
  check: (e) =>
    e.ambiguousTerms.every(
      (t) => new Set(t.readings.map((r) => r.toLowerCase().trim())).size >= 2,
    ),
};

export const CASES: EvalCase[] = [
  {
    id: "seed",
    question: "Does buying NIFTY after a sharp fall work?",
    rationale:
      "The assignment's own question. Everything important about it is undefined.",
    checks: [
      { name: "recognises NIFTY", check: (e) => e.instrument === "NIFTY50" },
      { name: "treats it as testable", check: (e) => e.isTestableHere },
      noInventedNumbers,
      flagsAmbiguity,
      offersRealAlternatives,
      {
        name: "names the vague term itself",
        check: (e) =>
          e.ambiguousTerms.some((t) =>
            /sharp|fall|work|drop/i.test(t.term),
          ),
      },
    ],
  },
  {
    id: "stated-fall",
    question: "Does buying NIFTY after it falls 3% in a day work?",
    rationale:
      "A stated size must be taken from the user, not re-asked and not overridden.",
    checks: [
      { name: "extracts -3%", check: (e) => e.statedFallPct === -3 },
      { name: "leaves holding period null", check: (e) => e.statedHoldingDays === null },
      { name: "testable", check: (e) => e.isTestableHere },
    ],
  },
  {
    id: "fully-specified",
    question:
      "Should I buy NIFTY when it drops 5% over 5 days and hold for 10 days?",
    rationale:
      "When the user has specified everything, the system should have nothing left to ask.",
    checks: [
      { name: "extracts -5%", check: (e) => e.statedFallPct === -5 },
      { name: "extracts the 5-day window", check: (e) => e.statedFallWindowDays === 5 },
      { name: "extracts the 10-day hold", check: (e) => e.statedHoldingDays === 10 },
    ],
  },
  {
    id: "unit-conversion",
    question: "Does buying NIFTY after a 2% fall and holding one month work?",
    rationale:
      "Calendar language has to become trading sessions, and a month is not 30 sessions.",
    checks: [
      { name: "extracts -2%", check: (e) => e.statedFallPct === -2 },
      {
        name: "reads 'one month' as roughly 20 sessions",
        check: (e) =>
          e.statedHoldingDays !== null &&
          e.statedHoldingDays >= 18 &&
          e.statedHoldingDays <= 23,
      },
    ],
  },
  {
    id: "percentage-trap",
    question: "Does NIFTY really return 12% a year over the long run?",
    rationale:
      "A percentage that is not a fall must not be captured as one. This is the case " +
      "where an eager reader does the most damage, because the resulting experiment " +
      "would look plausible and answer a question nobody asked.",
    checks: [
      {
        name: "does not mistake 12% for a fall threshold",
        check: (e) => e.statedFallPct === null,
      },
    ],
  },
  {
    id: "vague-dip",
    question: "Is buying the dip a good idea?",
    rationale: "Maximum vagueness, no instrument, no numbers.",
    checks: [noInventedNumbers, flagsAmbiguity, offersRealAlternatives],
  },
  {
    id: "out-of-scope-instrument",
    question: "Does buying Bitcoin after a crash work?",
    rationale:
      "Refusing the wrong question is better than answering it with NIFTY data.",
    checks: [
      { name: "marked out of scope", check: (e) => !e.isTestableHere },
      {
        name: "explains why",
        check: (e) => (e.outOfScopeReason ?? "").length > 10,
      },
    ],
  },
  {
    id: "out-of-scope-derivative",
    question: "What is the best NIFTY options straddle strategy before earnings?",
    rationale:
      "Mentions NIFTY but asks for something daily index data cannot address.",
    checks: [
      { name: "marked out of scope", check: (e) => !e.isTestableHere },
    ],
  },
  {
    id: "no-advice",
    question: "Should I put my savings into NIFTY after this week's fall?",
    rationale:
      "A personal-finance framing must not turn the restatement into advice.",
    checks: [
      {
        name: "restatement gives no recommendation",
        check: (e) =>
          !/\byou should\b|\bi recommend\b|\bbuy now\b|\bgood time to\b/i.test(
            e.restatement,
          ),
      },
      {
        name: "hypothesis stays falsifiable, not prescriptive",
        check: (e) =>
          !/\byou should\b|\bi recommend\b/i.test(e.hypothesis) &&
          e.hypothesis.length > 10,
      },
    ],
  },
];

export const TOTAL_CHECKS = CASES.reduce((n, c) => n + c.checks.length, 0);
