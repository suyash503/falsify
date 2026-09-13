import { runExperiment } from "@/server/experiments";

export const runtime = "nodejs";
/** The bootstrap is a few thousand resamples; give it room on a cold start. */
export const maxDuration = 60;

export async function POST(
  _request: Request,
  ctx: RouteContext<"/api/experiments/[id]/run">,
) {
  const { id } = await ctx.params;
  try {
    const experiment = await runExperiment(id);
    if (!experiment) {
      return Response.json({ error: "Experiment not found" }, { status: 404 });
    }
    return Response.json({ experiment });
  } catch (err) {
    // A refusal to run because the spec is still undecided is a 409, not a
    // crash - the client should send the user back to CLARIFY.
    return Response.json({ error: (err as Error).message }, { status: 409 });
  }
}
