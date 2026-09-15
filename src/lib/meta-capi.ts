import { prisma } from "@/lib/db";
import crypto from "crypto";

function sha256(s: string) {
  return crypto.createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
}

export async function getCapiSettings() {
  const rows = await prisma.crmSetting.findMany({
    where: { key: { in: ["capi_pixel_id", "capi_access_token", "capi_pixel_name"] } },
  });
  const map: Record<string, string> = {};
  rows.forEach((r) => (map[r.key] = r.value));
  return { pixelId: map["capi_pixel_id"] ?? "", accessToken: map["capi_access_token"] ?? "", pixelName: map["capi_pixel_name"] ?? "" };
}

export type CapiPayload = {
  eventName: string;
  customerId?: string | null;
  phone?: string | null;
  email?: string | null;
  name?: string | null;          // customer name → fn + ln
  fbclid?: string | null;        // URL fbclid (LP) atau ctwa_clid (CTWA)
  isCtwa?: boolean;              // true = ctwa_clid, fbc tidak di-wrap, action_source=business_messaging
  fbp?: string | null;           // _fbp cookie dari browser (Browser ID)
  actionSource?: string;         // override action_source (default: "other")
  campaignId?: string | null;
  adsetId?: string | null;
  adId?: string | null;
  value?: number | null;
  currency?: string | null;
  eventId?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
};

export async function sendCapiEvent(payload: CapiPayload) {
  const { pixelId, accessToken } = await getCapiSettings();
  if (!pixelId || !accessToken) return null;

  const eventId = payload.eventId ?? crypto.randomUUID();
  const userData: Record<string, string> = {};

  // Identifikasi user
  if (payload.phone) userData["ph"] = sha256(payload.phone.replace(/\D/g, ""));
  if (payload.email) userData["em"] = sha256(payload.email);
  // External ID: customerId (stable identifier untuk pencocokan lintas event)
  if (payload.customerId) userData["external_id"] = sha256(payload.customerId);

  // Nama: split spasi pertama → fn (first name) + ln (last name)
  if (payload.name && payload.name.trim()) {
    const parts = payload.name.trim().split(/\s+/);
    userData["fn"] = sha256(parts[0]);
    if (parts.length > 1) userData["ln"] = sha256(parts.slice(1).join(" "));
  }

  // Country default Indonesia
  userData["country"] = sha256("id");

  // action_source: "website" untuk LP (dari snippet), "other" untuk semua lainnya
  // CTWA: pakai "other" (bukan "business_messaging") karena Meta membatasi event name
  // yang valid untuk business_messaging dan butuh page_id. ctwa_clid tetap dikirim
  // sebagai fbc sehingga attributi CTWA tetap berfungsi di dashboard Meta.
  const actionSource = payload.actionSource ?? "other";

  // fbc: CTWA → ctwa_clid langsung (tidak di-wrap, sudah opaque)
  //       LP   → format fb.1.{creationTime}.{fbclid}
  let fbc: string | null = null;
  if (payload.fbclid) {
    fbc = payload.isCtwa
      ? payload.fbclid
      : `fb.1.${Math.floor(Date.now() / 1000)}.${payload.fbclid}`;
  }

  const body = {
    data: [
      {
        event_name: payload.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: actionSource,
        // Wajib ada saat action_source = "business_messaging"
        ...(actionSource === "business_messaging" ? { messaging_channel: "whatsapp" } : {}),
        user_data: {
          ...userData,
          ...(fbc ? { fbc } : {}),
          // fbp: Browser ID dari cookie _fbp (hanya tersedia untuk LP, tidak CTWA)
          ...(payload.fbp ? { fbp: payload.fbp } : {}),
          ...(payload.clientIpAddress ? { client_ip_address: payload.clientIpAddress } : {}),
          ...(payload.clientUserAgent ? { client_user_agent: payload.clientUserAgent } : {}),
        },
        custom_data: {
          ...(payload.value != null ? { value: payload.value, currency: payload.currency ?? "IDR" } : {}),
          campaign_id: payload.campaignId,
          adset_id: payload.adsetId,
          ad_id: payload.adId,
        },
      },
    ],
  };

  let status = "sent";
  let response = "";
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const json = await res.json();
    response = JSON.stringify(json);
    if (!res.ok) status = "error";
  } catch (e) {
    status = "error";
    response = String(e);
  }

  await prisma.capiEvent.create({
    data: {
      eventName: payload.eventName,
      customerId: payload.customerId ?? null,
      fbclid: payload.fbclid ?? null,
      campaignId: payload.campaignId ?? null,
      adsetId: payload.adsetId ?? null,
      adId: payload.adId ?? null,
      value: payload.value ?? null,
      currency: payload.currency ?? null,
      phone: payload.phone ? sha256(payload.phone.replace(/\D/g, "")) : null,
      email: payload.email ? sha256(payload.email) : null,
      eventId,
      pixelId,
      status,
      response,
    },
  });

  return { status, response };
}
