// Simulator channel — buat mengembangkan & menguji inbox tanpa WhatsApp asli.
// Di Tahap B disambungkan ke inbox; adaptor asli (Baileys/WABA) menyusul di Tahap G.

import type {
  ChannelAdapter,
  IncomingMessage,
  OutgoingMessage,
  SendResult,
} from "./types";

export class SimulatorAdapter implements ChannelAdapter {
  kind = "simulator" as const;
  private handlers: Array<(m: IncomingMessage) => void | Promise<void>> = [];

  async isConnected() {
    return true;
  }

  async send(msg: OutgoingMessage): Promise<SendResult> {
    // simulator: anggap selalu terkirim
    return { ok: true, externalId: "sim_" + msg.to };
  }

  onMessage(handler: (m: IncomingMessage) => void | Promise<void>) {
    this.handlers.push(handler);
  }

  // dipanggil UI/dev untuk menyuntik pesan masuk buatan
  async injectIncoming(from: string, text: string, name?: string) {
    const msg: IncomingMessage = {
      channel: "simulator",
      externalId: "in_" + from + "_" + text.length,
      from,
      name,
      text,
      timestamp: Date.now(),
    };
    for (const h of this.handlers) await h(msg);
    return msg;
  }
}
