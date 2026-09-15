// SSE broadcast hub — module-level singleton, satu proses PM2 (fork mode).
// Setiap koneksi /api/inbox/stream mendaftarkan controller-nya di sini.
// ingestIncoming & sendReply memanggil broadcast() agar semua tab inbox
// yang terbuka langsung menerima update tanpa polling.

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

const clients = new Set<SSEClient>();
const encoder = new TextEncoder();

export function addSSEClient(client: SSEClient) {
  clients.add(client);
}

export function removeSSEClient(client: SSEClient) {
  clients.delete(client);
}

// Broadcast event "inbox" ke semua client yang terhubung.
// type "incoming" = pesan dari customer (perlu bunyi notif)
// type "outgoing" = pesan dari agent / update status (tidak perlu bunyi)
export function broadcastInbox(conversationId: string, type: "incoming" | "outgoing" = "outgoing") {
  if (clients.size === 0) return;
  const payload = encoder.encode(
    `event: inbox\ndata: ${JSON.stringify({ conversationId, type })}\n\n`
  );
  for (const client of clients) {
    try {
      client.controller.enqueue(payload);
    } catch {
      clients.delete(client);
    }
  }
}
