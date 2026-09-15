import type { Channel } from "@prisma/client";

export const CHANNEL_META: Record<
  Channel,
  { label: string; short: string; color: string }
> = {
  SIMULATOR: { label: "Simulator", short: "SIM", color: "#6b7280" },
  WA_QR: { label: "WhatsApp", short: "WA", color: "#16a34a" },
  WA_CLOUD: { label: "WhatsApp Resmi", short: "WA", color: "#16a34a" },
  INSTAGRAM: { label: "Instagram", short: "IG", color: "#d6249f" },
  MESSENGER: { label: "Messenger", short: "MSG", color: "#0084ff" },
};
