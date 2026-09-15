// WhatsApp Cloud API (Meta Graph) — kirim pesan.
const GRAPH = "https://graph.facebook.com/v21.0";

export async function fetchWabaTemplates(wabaId: string, token: string) {
  const res = await fetch(
    `${GRAPH}/${wabaId}/message_templates?limit=250&access_token=${token}`,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`WABA templates ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return (data.data ?? []) as Array<{
    id: string;
    name: string;
    language: string;
    status: string;
    category: string;
    components?: Array<{ type: string; text?: string }>;
  }>;
}

// Submit template baru ke Meta untuk review/approval.
export async function createWabaTemplate(
  wabaId: string,
  token: string,
  payload: {
    name: string;
    language: string;
    category: string;
    components: Array<{ type: string; format?: string; text?: string }>;
  },
) {
  const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`Create template ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return data as { id: string; status: string; category?: string };
}

// Hapus template dari Meta (berdasarkan nama — menghapus semua bahasa).
export async function deleteWabaTemplate(wabaId: string, token: string, name: string) {
  const res = await fetch(
    `${GRAPH}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`Delete template ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data as { success: boolean };
}

// Update isi template yang sudah ada di Meta (via metaId).
export async function updateWabaTemplate(
  metaId: string,
  token: string,
  components: Array<{ type: string; format?: string; text?: string }>,
  category?: string,
) {
  const body: Record<string, unknown> = { components };
  if (category) body.category = category;
  const res = await fetch(`${GRAPH}/${metaId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`Update template ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data as { success: boolean };
}

// Kirim pesan template (buat broadcast / di luar window 24 jam).
export async function sendWabaTemplate(
  phoneNumberId: string,
  to: string,
  templateName: string,
  language: string,
  token: string,
) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name: templateName, language: { code: language } },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`WABA template send ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// id wamid pesan yang dikirim (buat simpan externalId + pemetaan reply)
function sentId(data: unknown): string | null {
  const d = data as { messages?: Array<{ id?: string }> };
  return d?.messages?.[0]?.id ?? null;
}

export async function sendWabaText(
  phoneNumberId: string,
  to: string,
  text: string,
  token: string,
  replyToWamid?: string | null,
) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
      ...(replyToWamid ? { context: { message_id: replyToWamid } } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`WABA send ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { data, id: sentId(data) };
}

export async function sendWabaMedia(
  phoneNumberId: string,
  to: string,
  type: "image" | "video" | "audio" | "document",
  link: string,
  token: string,
  filename?: string,
  replyToWamid?: string | null,
) {
  const media: { link: string; filename?: string } = { link };
  if (type === "document" && filename) media.filename = filename;
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type,
      [type]: media,
      ...(replyToWamid ? { context: { message_id: replyToWamid } } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(`WABA media ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { data, id: sentId(data) };
}

// Unduh media masuk dari WhatsApp Cloud API (2 langkah: ambil URL, lalu unduh biner).
export async function downloadWabaMedia(
  mediaId: string,
  token: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const metaRes = await fetch(`${GRAPH}/${mediaId}?access_token=${token}`);
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok || !meta.url) return null;
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!binRes.ok) return null;
    const buffer = Buffer.from(await binRes.arrayBuffer());
    return { buffer, mime: meta.mime_type || "application/octet-stream" };
  } catch (e) {
    console.error("downloadWabaMedia error:", e);
    return null;
  }
}
