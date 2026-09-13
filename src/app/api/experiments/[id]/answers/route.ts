import { z } from "zod";
import { submitAnswers } from "@/server/experiments";

export const runtime = "nodejs";

const answersSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number()])),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/experiments/[id]/answers">,
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = answersSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid answers" },
      { status: 400 },
    );
  }

  try {
    const experiment = await submitAnswers(id, parsed.data.answers);
    if (!experiment) {
      return Response.json({ error: "Experiment not found" }, { status: 404 });
    }
    return Response.json({ experiment });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
