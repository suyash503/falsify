import { describe, expect, it } from "vitest";
import { deterministicExtract } from "@/agents/interpreter";
import { extractionSchema } from "@/agents/schemas";
import { CASES } from "../evals/cases";

/**
 * The golden set, run against the rule-based reader.
 *
 * The same cases are scored against a live model by `npm run eval`, which needs
 * an API key and a network. This suite keeps the fallback honest in CI, where
 * neither is available - the fallback is what a reviewer actually meets when
 * they clone the repo, so it is the path that must not rot.
 */
describe("interpretation golden set (deterministic reader)", () => {
  for (const testCase of CASES) {
    describe(`${testCase.id}: "${testCase.question}"`, () => {
      const extraction = deterministicExtract(testCase.question);

      it("returns output matching the schema", () => {
        expect(extractionSchema.safeParse(extraction).success).toBe(true);
      });

      for (const check of testCase.checks) {
        it(check.name, () => {
          expect(check.check(extraction)).toBe(true);
        });
      }
    });
  }
});
