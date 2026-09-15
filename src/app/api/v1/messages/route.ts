import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/apikey";
import { apiSendText, apiSendTemplate } from "@/lib/inbox";

export const dynamic = "force-dynamic";

// POST /api/v1/messages
// Header: Authorization: Bearer <API_KEY>
// Body: { to, type?: "text"|"template", text?, template?, language?, from? }
export async function POST(req: Request) {
  const key = await verifyApiKey(req);
  if (!key) return NextResponse.json({ error: "invalid api key" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const to = (body.to ?? "").toString().replace(/\D/g, "");
  if (!to) return NextResponse.json({ error: "field 'to' wajib" }, { status: 400 });
  const from = body.from ? body.from.toString() : undefined;

  try {
    if (body.type === "template") {
      if (!body.template)
        return NextResponse.json({ error: "field 'template' wajib" }, { status: 400 });
      const r = await apiSendTemplate(from, to, body.template.toString(), (body.language ?? "id").toString());
      return NextResponse.json({ ok: true, ...r });
    }
    const text = (body.text ?? "").toString();
    if (!text.trim())
      return NextResponse.json({ error: "field 'text' wajib" }, { status: 400 });
    const r = await apiSendText(from, to, text);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "gagal kirim" },
      { status: 502 },
    );
  }
}
