import { LLMError, type CompletionRequest, type CompletionResult, type LLMProvider } from "./types";

/**
 * One interface, several vendors.
 *
 * This is not vendor-neutrality for its own sake. The product has to keep
 * working for a reviewer who has no API key at all, and the only way to
 * guarantee that is to make the LLM a replaceable component rather than a
 * load-bearing one. The deterministic path in `src/agents/fallback.ts` is the
 * final link in the same chain.
 */

const TIMEOUT_MS = 20_000;

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  provider: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new LLMError(
        `${provider} returned ${res.status}: ${detail.slice(0, 300)}`,
        provider,
        res.status,
      );
    }
    return await res.json();
  } catch (err) {
    if (err instanceof LLMError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LLMError(`${provider} timed out after ${TIMEOUT_MS}ms`, provider);
    }
    throw new LLMError(
      `${provider} request failed: ${(err as Error).message}`,
      provider,
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */

function geminiProvider(apiKey: string): LLMProvider {
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  return {
    id: "gemini",
    label: "Google Gemini",
    model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const started = Date.now();
      const payload = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: {
            temperature: req.temperature ?? 0.2,
            maxOutputTokens: req.maxTokens ?? 2048,
            ...(req.json ? { responseMimeType: "application/json" } : {}),
          },
        },
        { "x-goog-api-key": apiKey },
        "gemini",
      );

      const p = payload as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      const text = p.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
      if (!text) throw new LLMError("Gemini returned an empty completion", "gemini");

      return {
        text,
        provider: "gemini",
        model,
        latencyMs: Date.now() - started,
        inputTokens: p.usageMetadata?.promptTokenCount,
        outputTokens: p.usageMetadata?.candidatesTokenCount,
      };
    },
  };
}

function groqProvider(apiKey: string): LLMProvider {
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  return {
    id: "groq",
    label: "Groq",
    model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const started = Date.now();
      const payload = await postJson(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 2048,
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        },
        { authorization: `Bearer ${apiKey}` },
        "groq",
      );

      const p = payload as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = p.choices?.[0]?.message?.content ?? "";
      if (!text) throw new LLMError("Groq returned an empty completion", "groq");

      return {
        text,
        provider: "groq",
        model,
        latencyMs: Date.now() - started,
        inputTokens: p.usage?.prompt_tokens,
        outputTokens: p.usage?.completion_tokens,
      };
    },
  };
}

function anthropicProvider(apiKey: string): LLMProvider {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  return {
    id: "anthropic",
    label: "Anthropic Claude",
    model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const started = Date.now();
      const payload = await postJson(
        "https://api.anthropic.com/v1/messages",
        {
          model,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.2,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        },
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        "anthropic",
      );

      const p = payload as {
        content?: { text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = p.content?.map((c) => c.text ?? "").join("") ?? "";
      if (!text) throw new LLMError("Anthropic returned an empty completion", "anthropic");

      return {
        text,
        provider: "anthropic",
        model,
        latencyMs: Date.now() - started,
        inputTokens: p.usage?.input_tokens,
        outputTokens: p.usage?.output_tokens,
      };
    },
  };
}

/* ------------------------------------------------------------------ */

const REGISTRY = [
  { id: "gemini", env: "GEMINI_API_KEY", build: geminiProvider },
  { id: "groq", env: "GROQ_API_KEY", build: groqProvider },
  { id: "anthropic", env: "ANTHROPIC_API_KEY", build: anthropicProvider },
] as const;

/**
 * Returns the configured provider, or null when no key is present - in which
 * case the caller must use the deterministic path. Set LLM_PROVIDER to pin a
 * specific vendor; otherwise the first configured one wins.
 */
export function resolveProvider(): LLMProvider | null {
  const pinned = process.env.LLM_PROVIDER?.toLowerCase();
  const candidates = pinned
    ? REGISTRY.filter((r) => r.id === pinned)
    : REGISTRY;

  for (const entry of candidates) {
    const key = process.env[entry.env];
    if (key) return entry.build(key);
  }
  return null;
}

/** Shown in the UI so the reviewer can see which brain is answering. */
export function providerStatus() {
  const active = resolveProvider();
  return {
    activeId: active?.id ?? "deterministic",
    activeLabel: active?.label ?? "Deterministic fallback (no API key configured)",
    activeModel: active?.model ?? "rule-based",
    configured: REGISTRY.filter((r) => Boolean(process.env[r.env])).map((r) => r.id),
  };
}
