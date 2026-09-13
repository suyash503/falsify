import { providerStatus } from "@/llm/providers";
import { getRepository } from "@/db";
import { loadMeta } from "@/server/dataset";

export const runtime = "nodejs";

/**
 * Everything the UI needs to be honest about its own configuration: which
 * model is answering, whether the journal is persistent, and exactly which
 * dataset the numbers came from. A research tool that hides its own provenance
 * has no business asking anyone to trust its output.
 */
export async function GET() {
  const meta = loadMeta();
  return Response.json({
    llm: providerStatus(),
    storage: getRepository().kind,
    dataset: {
      instrument: meta.instrument,
      source: meta.source,
      range: meta.actual_range,
      rows: meta.rows,
      sha256: meta.sha256,
      retrievedAt: meta.retrieved_at,
      limitations: meta.known_limitations,
    },
  });
}
