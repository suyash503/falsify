import type { ZodType } from "zod";
import { LLMError, type CompletionRequest, type CompletionResult, type LLMProvider } from "./types";

/**
 * The boundary between the language model and the rest of the system.
 *
 * Nothing a model produces reaches the backtest engine as-is. It is extracted,
 * parsed, and validated against the same Zod schema the rest of the app uses;
 * a model that returns something unusable gets exactly one chance to fix it,
 * and then the caller falls back to deterministic logic. An LLM is treated
 * here as an untrusted parser of natural language, not as an oracle.
 */

/** Pull the first JSON object out of a response that may be fenced or chatty. */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  const start = candidate.indexOf("{");
  if (start === -1) return candidate;

  // Walk to the matching brace so trailing prose does not break the parse.
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return candidate.slice(start);
}

export interface StructuredOutcome<T> {
  value: T;
  result: CompletionResult;
  /** True when the first attempt failed validation and a repair was needed. */
  repaired: boolean;
}

export async function completeStructured<T>(
  provider: LLMProvider,
  schema: ZodType<T>,
  req: CompletionRequest,
): Promise<StructuredOutcome<T>> {
  const first = await provider.complete({ ...req, json: true });

  const attempt = schema.safeParse(safeJsonParse(extractJson(first.text)));
  if (attempt.success) {
    return { value: attempt.data, result: first, repaired: false };
  }

  // One repair round. We hand back the exact validation errors rather than a
  // vague "that was wrong", because specific feedback is what makes the second
  // attempt likely to succeed.
  const issues = attempt.error.issues
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");

  const repair = await provider.complete({
    ...req,
    json: true,
    user:
      `${req.user}\n\n---\n\nYour previous response failed schema validation:\n\n` +
      `${first.text.slice(0, 1500)}\n\nErrors:\n${issues}\n\n` +
      `Return corrected JSON only. No prose, no code fences.`,
  });

  const second = schema.safeParse(safeJsonParse(extractJson(repair.text)));
  if (second.success) {
    return { value: second.data, result: repair, repaired: true };
  }

  throw new LLMError(
    `Model output failed schema validation twice: ${second.error.issues[0]?.message ?? "unknown"}`,
    provider.id,
  );
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
