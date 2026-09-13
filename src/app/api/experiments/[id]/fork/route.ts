import { z } from "zod";
import { forkExperiment } from "@/server/experiments";

export const runtime = "nodejs";

const forkSchema = z.object({
  nextExperimentId: z.string().min(1),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/experiments/[id]/fork">,
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = forkSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid fork request" },
      { status: 400 },
    );
  }

  const experiment = await forkExperiment(id, parsed.data.nextExperimentId);
  if (!experiment) {
    return Response.json(
      { error: "Parent experiment or follow-up proposal not found" },
      { status: 404 },
    );
  }
  return Response.json({ experiment }, { status: 201 });
}
