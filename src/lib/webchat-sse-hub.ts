// SSE hub untuk widget webchat — satu entry per conversationId
const clients = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();
const encoder = new TextEncoder();

export function addWebChatClient(conversationId: string, ctrl: ReadableStreamDefaultController<Uint8Array>) {
  if (!clients.has(conversationId)) clients.set(conversationId, new Set());
  clients.get(conversationId)!.add(ctrl);
}

export function removeWebChatClient(conversationId: string, ctrl: ReadableStreamDefaultController<Uint8Array>) {
  clients.get(conversationId)?.delete(ctrl);
  if (clients.get(conversationId)?.size === 0) clients.delete(conversationId);
}

export function broadcastWebChat(conversationId: string, payload: Record<string, unknown>) {
  const set = clients.get(conversationId);
  if (!set?.size) return;
  const data = encoder.encode(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
  for (const ctrl of set) {
    try { ctrl.enqueue(data); } catch { set.delete(ctrl); }
  }
}
