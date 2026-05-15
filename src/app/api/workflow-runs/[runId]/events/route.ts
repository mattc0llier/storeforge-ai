import { getRun } from "workflow/api";

type WorkflowEventsRouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(
  _request: Request,
  { params }: WorkflowEventsRouteContext,
) {
  const { runId } = await params;

  try {
    const run = await getRun(runId);
    const encoder = new TextEncoder();
    const stream = run.getReadable({ startIndex: -50 }).pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          const data =
            typeof chunk === "string" ? chunk : JSON.stringify(chunk);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        },
      }),
    );

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return Response.json(
      { ok: false, error: `Workflow run ${runId} not found` },
      { status: 404 },
    );
  }
}
