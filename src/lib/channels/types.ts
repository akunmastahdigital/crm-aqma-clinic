// Channel adapter — fondasi biar semua channel (WA QR, WABA, IG, Messenger,
// dan simulator) diperlakukan seragam. Tahap A cukup interface + simulator.

export type ChannelKind =
  | "simulator"
  | "wa_qr" // WhatsApp Business biasa (scan QR / Baileys)
  | "wa_cloud" // WhatsApp resmi (Cloud API / WABA)
  | "instagram"
  | "messenger";

export type IncomingMessage = {
  channel: ChannelKind;
  externalId: string; // id pesan dari sisi channel
  from: string; // nomor / user id pengirim
  name?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  timestamp: number;
};

export type OutgoingMessage = {
  to: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "document";
};

export type SendResult = { ok: boolean; externalId?: string; error?: string };

export interface ChannelAdapter {
  kind: ChannelKind;
  // status koneksi channel
  isConnected(): Promise<boolean>;
  // kirim pesan keluar
  send(msg: OutgoingMessage): Promise<SendResult>;
  // daftarkan handler pesan masuk
  onMessage(handler: (msg: IncomingMessage) => void | Promise<void>): void;
}
