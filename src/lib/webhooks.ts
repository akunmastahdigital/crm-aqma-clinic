import { prisma } from "@/lib/db";
import crypto from "crypto";

// Tembak webhook keluar ke semua endpoint yang subscribe event ini (fire-and-forget).
export async function fireWebhook(event: string, data: unknown) {
  let endpoints;
  try {
    endpoints = await prisma.webhookEndpoint.findMany({
      where: { active: true, events: { has: event } },
    });
  } catch {
    return;
  }
  if (endpoints.length === 0) return;

  const bodyStr = JSON.stringify({ event, data, ts: Date.now() });
  await Promise.all(
    endpoints.map(async (ep) => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (ep.secret)
          headers["X-Signature"] = crypto
            .createHmac("sha256", ep.secret)
            .update(bodyStr)
            .digest("hex");
        await fetch(ep.url, { method: "POST", headers, body: bodyStr });
      } catch (e) {
        console.error("fireWebhook error:", ep.url, e);
      }
    }),
  );
}
