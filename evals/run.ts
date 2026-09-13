/**
 * Scores the interpretation stage against the golden set.
 *
 *   npx tsx evals/run.ts                 # scores whichever path is configured
 *   npx tsx evals/run.ts --deterministic # forces the rule-based reader
 *   npx tsx evals/run.ts --json report.json
 *
 * Exits non-zero below the pass threshold, so it can gate a pull request.
 *
 * Why a bespoke harness rather than promptfoo: the assertions worth making here
 * are not "does the output contain this string" but "did it correctly decline
 * to fill in a number the user never gave". Those are predicates over a typed
 * object, and the object is validated by the same Zod schema the application
 * uses. Running the evaluation through the real code path means a schema change
 * breaks the evaluation, which is exactly the coupling you want.
 */
import { writeFileSync } from "node:fs";
import { deterministicExtract, interpret } from "../src/agents/interpreter";
import { providerStatus } from "../src/llm/providers";
import { CASES, TOTAL_CHECKS } from "./cases";
import type { Extraction } from "../src/agents/schemas";

const PASS_THRESHOLD = 0.9;

const args = process.argv.slice(2);
const forceDeterministic = args.includes("--deterministic");
const jsonIndex = args.indexOf("--json");
const jsonPath = jsonIndex >= 0 ? args[jsonIndex + 1] : null;

interface CaseReport {
  id: string;
  question: string;
  rationale: string;
  passed: number;
  total: number;
  failures: string[];
  source: string;
  latencyMs: number | null;
  error: string | null;
}

async function main() {
  const status = providerStatus();
  const mode = forceDeterministic ? "deterministic (forced)" : status.activeLabel;

  console.log("Interpretation eval");
  console.log(`  reader:  ${mode}`);
  console.log(`  cases:   ${CASES.length}`);
  console.log(`  checks:  ${TOTAL_CHECKS}`);
  console.log();

  const reports: CaseReport[] = [];

  for (const testCase of CASES) {
    let extraction: Extraction | null = null;
    let source = "deterministic";
    let latencyMs: number | null = null;
    let error: string | null = null;

    try {
      if (forceDeterministic) {
        extraction = deterministicExtract(testCase.question);
      } else {
        const outcome = await interpret(testCase.question);
        extraction = outcome.extraction;
        source = outcome.source;
        latencyMs = outcome.latencyMs ?? null;
        if (outcome.fallbackReason) error = `fell back: ${outcome.fallbackReason}`;
      }
    } catch (err) {
      error = (err as Error).message;
    }

    const failures: string[] = [];
    let passed = 0;
    if (extraction) {
      for (const check of testCase.checks) {
        let ok = false;
        try {
          ok = check.check(extraction);
        } catch {
          ok = false;
        }
        if (ok) passed++;
        else failures.push(check.name);
      }
    }

    reports.push({
      id: testCase.id,
      question: testCase.question,
      rationale: testCase.rationale,
      passed,
      total: testCase.checks.length,
      failures,
      source,
      latencyMs,
      error,
    });

    const mark = failures.length === 0 && !error ? "PASS" : "FAIL";
    const timing = latencyMs !== null ? ` ${latencyMs}ms` : "";
    console.log(
      `  ${mark}  ${testCase.id.padEnd(24)} ${passed}/${testCase.checks.length}${timing}`,
    );
    for (const f of failures) console.log(`          - ${f}`);
    if (error) console.log(`          ! ${error}`);
  }

  const passedChecks = reports.reduce((n, r) => n + r.passed, 0);
  const rate = passedChecks / TOTAL_CHECKS;

  console.log();
  console.log(
    `  ${passedChecks}/${TOTAL_CHECKS} checks passed (${(rate * 100).toFixed(1)}%)`,
  );

  if (jsonPath) {
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          reader: mode,
          ranAt: new Date().toISOString(),
          passedChecks,
          totalChecks: TOTAL_CHECKS,
          passRate: rate,
          cases: reports,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`  report written to ${jsonPath}`);
  }

  if (rate < PASS_THRESHOLD) {
    console.error(
      `\nBelow the ${(PASS_THRESHOLD * 100).toFixed(0)}% threshold.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
