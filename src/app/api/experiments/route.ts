import { z } from "zod";
import { createExperiment, listExperiments } from "@/server/experiments";

export const runtime = "nodejs";

const createSchema = z.object({
  question: z.string().min(5).max(500),
});

export async function GET() {
  const experiments = await listExperiments();
  return Response.json({ experiments });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const experiment = await createExperiment(parsed.data.question);
    return Response.json({ experiment }, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
