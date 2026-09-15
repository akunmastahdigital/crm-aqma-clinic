import { NextResponse } from "next/server";
import { verifyKonektorSignature, syncKonektorLead } from "@/lib/konektor";

export const dynamic = "force-dynamic";

// Penerima webhook Konektor (lead.created / lead.updated).
// Verifikasi signature pakai RAW body, lalu sinkron lead ke CRM.
export async function POST(req: Request) {
  const secret = process.env.KONEKTOR_WEBHOOK_SECRET;
  if (!secret) {
    console.error("KONEKTOR_WEBHOOK_SECRET belum di-set");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const sig = req.headers.get("x-konektor-signature");
  if (!verifyKonektorSignature(raw, sig, secret))
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const event = req.headers.get("x-konektor-event") || "";
  let body: {
    lead?: Record<string, unknown>;
    source?: string;
    previousStatus?: string;
    newStatus?: string;
    changes?: string[];
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const lead = body.lead;
  if (!lead?.id) return NextResponse.json({ received: true, skipped: "no lead" });

  try {
    await syncKonektorLead(event, lead as never, {
      source: body.source,
      previousStatus: body.previousStatus,
      newStatus: body.newStatus,
      changes: body.changes,
    });
  } catch (e) {
    console.error("konektor sync error:", e);
    // tetap balas 2xx supaya tidak diretry terus untuk error internal non-fatal
  }

  return NextResponse.json({ received: true });
}
