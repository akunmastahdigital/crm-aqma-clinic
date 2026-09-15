import { getSession } from "@/lib/auth";
import { addSSEClient, removeSSEClient } from "@/lib/sse-hub";

export const dynamic = "force-dynamic";

// GET /api/inbox/stream — SSE endpoint, satu koneksi per tab inbox.
// Client subscribe lalu server push event "inbox" saat ada pesan baru.
export async function GET() {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const clientId = session.uid + "-" + Math.random().toString(36).slice(2);

  let clientRef: { id: string; controller: ReadableStreamDefaultController<Uint8Array> } | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      clientRef = { id: clientId, controller };
      addSSEClient(clientRef);
      // Kirim ping awal agar browser tahu koneksi berhasil
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      if (clientRef) removeSSEClient(clientRef);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // matikan buffering nginx agar event langsung sampai
    },
  });
}
