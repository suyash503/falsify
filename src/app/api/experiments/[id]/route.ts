import { strategySpecSchema } from "@/core/spec";
import { getExperiment, getLineage, reviseSpec } from "@/server/experiments";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/experiments/[id]">,
) {
  const { id } = await ctx.params;
  const experiment = await getExperiment(id);
  if (!experiment) {
    return Response.json({ error: "Experiment not found" }, { status: 404 });
  }
  const children = await getLineage(id);
  return Response.json({ experiment, children });
}

/** Direct edit of the experiment definition from the DEFINE panel. */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/experiments/[id]">,
) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = strategySpecSchema.safeParse(
    (body as { spec?: unknown } | null)?.spec,
  );
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid experiment definition" },
      { status: 400 },
    );
  }

  const experiment = await reviseSpec(id, parsed.data);
  if (!experiment) {
    return Response.json({ error: "Experiment not found" }, { status: 404 });
  }
  return Response.json({ experiment });
}
