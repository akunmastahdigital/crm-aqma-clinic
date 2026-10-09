import { prisma } from "@/lib/db";
import { addWebChatClient, removeWebChatClient } from "@/lib/webchat-sse-hub";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await prisma.webChatSession.findUnique({ where: { token }, select: { conversationId: true } });
  if (!session?.conversationId) {
    return new Response("Session not found", { status: 404 });
  }
  const conversationId = session.conversationId;

  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      addWebChatClient(conversationId, ctrl);
      const encoder = new TextEncoder();
      ctrl.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      removeWebChatClient(conversationId, ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
