import { z } from "zod";

/**
 * What the language model is allowed to return.
 *
 * These schemas are deliberately narrow. The model is asked to read English -
 * to notice that "sharp fall" is undefined, that no holding period was given,
 * that no test window was named - and nothing more. It does not choose
 * thresholds, it does not compute frequencies, and it does not reach a verdict.
 * Those are jobs for code that can be unit-tested.
 *
 * Anything numeric the model *does* return is something the user literally
 * typed, and it passes through a range check on the way in.
 */

export const extractionSchema = z.object({
  /** Null when the user named an instrument this prototype does not carry. */
  instrument: z.enum(["NIFTY50"]).nullable(),

  /**
   * Whether this is even the shape of question the system can test. A question
   * about options pricing or a single stock should be turned away honestly
   * rather than quietly answered with the wrong experiment.
   */
  isTestableHere: z.boolean(),
  outOfScopeReason: z.string().nullable(),

  /** Values the user actually stated. Null means "not mentioned". */
  statedFallPct: z.number().min(-80).max(0).nullable(),
  statedFallWindowDays: z.number().int().min(1).max(60).nullable(),
  statedHoldingDays: z.number().int().min(1).max(250).nullable(),

  /** The question rewritten precisely, without adding anything. */
  restatement: z.string().min(10).max(300),
  /** A falsifiable version of the claim. */
  hypothesis: z.string().min(10).max(300),

  /**
   * The heart of the CLARIFY step: terms that cannot be tested until someone
   * decides what they mean.
   */
  ambiguousTerms: z
    .array(
      z.object({
        term: z.string().min(1).max(60),
        whyAmbiguous: z.string().min(10).max(300),
        readings: z.array(z.string().min(1).max(120)).min(2).max(4),
      }),
    )
    .max(5),
});
export type Extraction = z.infer<typeof extractionSchema>;

/**
 * The critic rephrases questions we have already constructed, using counts we
 * have already computed. It may sharpen the wording; it may not invent a fact.
 */
export const critiqueSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        question: z.string().min(10).max(200),
        whyItMatters: z.string().min(10).max(300),
      }),
    )
    .max(6),
  /** Direct challenges to the framing - the "are you sure?" voice. */
  challenges: z
    .array(
      z.object({
        title: z.string().min(5).max(120),
        detail: z.string().min(10).max(400),
      }),
    )
    .max(4),
});
export type Critique = z.infer<typeof critiqueSchema>;

/**
 * The narrator writes the LEARN step. Note what is absent: there is no verdict
 * field. The verdict arrives already decided by `concludeFrom()`, and the
 * narrator's job is to express it, not to revisit it.
 */
export const narrationSchema = z.object({
  /** Strictly observational sentences. No causal language, no advice. */
  whatTheDataShows: z.array(z.string().min(10).max(300)).min(1).max(5),
  /** The interpretation, which must agree with the supplied verdict. */
  whatWeConclude: z.string().min(20).max(600),
  /** Claims a reader might wrongly take away, named and refused. */
  whatWeCannotSay: z.array(z.string().min(10).max(300)).min(1).max(4),
});
export type Narration = z.infer<typeof narrationSchema>;
