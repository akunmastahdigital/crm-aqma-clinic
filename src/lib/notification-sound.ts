// Web Audio API — generate suara notifikasi "ding ding" tanpa file audio eksternal.
// AudioContext dibuat lazy dan di-resume otomatis setelah ada interaksi user.

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function ding(freq: number, startAt: number, c: AudioContext) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, c.currentTime + startAt);
  gain.gain.setValueAtTime(0, c.currentTime + startAt);
  gain.gain.linearRampToValueAtTime(0.25, c.currentTime + startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startAt + 0.35);
  osc.start(c.currentTime + startAt);
  osc.stop(c.currentTime + startAt + 0.35);
}

export function playInboxSound() {
  try {
    const c = ensureCtx();
    ding(880, 0, c);
    ding(1100, 0.2, c);
  } catch {
    // audio tidak tersedia di browser ini, abaikan
  }
}
