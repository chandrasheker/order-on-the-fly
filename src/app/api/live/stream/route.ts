import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { subscribeLive, type LivePing } from "@/lib/live-hub";
import { loadTableByQrForRequest, opaqueNotFoundJson } from "@/platform/tenant-scope";
import { assertCustomerDiningAccess } from "@/lib/customer-dining-guard";
import { withForensicApiRoute } from "@/platform/forensics/with-forensic-api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseResponse(req: NextRequest, restaurantId: string, tableId?: string | null) {
  const encoder = new TextEncoder();
  let unsub = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      send({ type: "hello" });
      unsub = subscribeLive(restaurantId, (ping: LivePing) => {
        if (tableId && ping.tableId && ping.tableId !== tableId) return;
        try {
          send({ type: ping.type ?? "refresh" });
        } catch {
          /* stream already closed */
        }
      });
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 15000);
      const close = () => {
        if (heartbeat) clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsub();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function handleGET(req: NextRequest) {
  const tableToken = req.nextUrl.searchParams.get("tableToken");
  const sessionKey = req.nextUrl.searchParams.get("sessionKey");

  if (tableToken) {
    const { table, resolution } = await loadTableByQrForRequest(req, tableToken);
    if (!resolution.ok || !table) return opaqueNotFoundJson();
    if (sessionKey) {
      const dining = await assertCustomerDiningAccess(req, tableToken, sessionKey);
      if (!dining.ok) {
        return new Response(JSON.stringify({ error: dining.error }), {
          status: dining.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return sseResponse(req, table.restaurantId, table.id);
  }

  const session = await requireSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return sseResponse(req, session.restaurantId);
}

export const GET = withForensicApiRoute(handleGET);
