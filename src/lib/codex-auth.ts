import fs from "fs/promises";
import path from "path";

const AUTH_FILE = path.join(process.env.HOME ?? "/root", ".codex/auth.json");
// Client ID Codex CLI (dari auth.json tokens.id_token claim aud)
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

interface CodexAuth {
  auth_mode: string;
  OPENAI_API_KEY: string | null;
  tokens: {
    id_token: string;
    access_token: string;
    refresh_token: string;
    account_id: string;
  };
  last_refresh: string;
}

function jwtExpiryMs(token: string): number {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

async function doRefresh(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token?: string };
  return data.access_token ?? null;
}

export async function getCodexAccessToken(): Promise<string> {
  const raw = await fs.readFile(AUTH_FILE, "utf-8");
  const auth: CodexAuth = JSON.parse(raw);

  // Jika ada API key biasa, pakai itu
  if (auth.OPENAI_API_KEY) return auth.OPENAI_API_KEY;

  const { access_token, refresh_token } = auth.tokens;

  // Cek apakah access_token masih valid (buffer 5 menit)
  const expiry = jwtExpiryMs(access_token);
  if (expiry > Date.now() + 5 * 60 * 1000) {
    return access_token;
  }

  // Access token expired — refresh
  const newToken = await doRefresh(refresh_token);
  if (!newToken) {
    throw new Error(
      "Token Codex sudah expired dan gagal di-refresh. Jalankan 'codex' di terminal server untuk login ulang."
    );
  }

  // Simpan token baru ke auth.json supaya sesi berikutnya langsung valid
  auth.tokens.access_token = newToken;
  auth.last_refresh = new Date().toISOString();
  await fs.writeFile(AUTH_FILE, JSON.stringify(auth, null, 2), "utf-8");

  return newToken;
}
