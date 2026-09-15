const GRAPH = "https://graph.facebook.com/v21.0";

// Ambil nama/username pengirim dari Meta Graph API (silent — return null kalau gagal)
export async function getMetaUserName(userId: string, accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH}/${userId}?fields=name,username&access_token=${encodeURIComponent(accessToken)}`,
    );
    const data = await res.json();
    if (!res.ok) return null;
    return (data.name as string) || (data.username as string) || null;
  } catch {
    return null;
  }
}

export async function sendIgDM(igAccountId: string, recipientId: string, text: string, accessToken: string) {
  const res = await fetch(`${GRAPH}/${igAccountId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
  return data as { message_id?: string };
}

export async function sendMessengerDM(pageId: string, recipientId: string, text: string, accessToken: string) {
  const res = await fetch(`${GRAPH}/${pageId}/messages?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_type: "RESPONSE",
      recipient: { id: recipientId },
      message: { text },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
  return data as { message_id?: string };
}

export async function sendIgCommentReply(commentId: string, text: string, accessToken: string) {
  const res = await fetch(`${GRAPH}/${commentId}/replies?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
  return data as { id?: string };
}

export async function sendFbCommentReply(commentId: string, text: string, accessToken: string) {
  const res = await fetch(`${GRAPH}/${commentId}/comments?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? JSON.stringify(data));
  return data as { id?: string };
}
