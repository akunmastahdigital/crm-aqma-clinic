import { spawn } from "child_process";

const CODEX_BIN = "/root/.local/bin/codex";
const TIMEOUT_MS = 120_000; // 2 menit

// Kirim prompt langsung via stdin — lebih reliable dari file approach
export async function callCodexExec(fullPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      CODEX_BIN,
      ["exec", "--sandbox", "read-only", "--skip-git-repo-check"],
      { env: { ...process.env, HOME: "/root" }, cwd: "/tmp" },
    );

    proc.stdin.write(fullPrompt);
    proc.stdin.end();

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Codex exec timeout"));
    }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);

      const combined = stdout + stderr;
      if (!combined.trim()) {
        reject(new Error(`Codex exec tidak ada output (exit ${code})`));
        return;
      }

      // Format output Codex:
      //   ...header (stderr)...
      //   codex
      //   [respons AI]        ← bagian ini yang kita mau
      //   tokens used
      //   [count]
      //   [respons muncul lagi di stdout = duplikat]
      //
      // Potong di "tokens used" dulu agar regex tidak menangkap duplikat

      // Prioritas 1: ambil section bersih antara "codex\n" dan "tokens used"
      const codexSection = combined.match(/\ncodex\n([\s\S]*?)(?=\ntokens used)/);
      if (codexSection) {
        resolve(codexSection[1].trim());
        return;
      }

      // Prioritas 2: potong di "tokens used", pakai bagian sebelumnya
      const beforeTokens = combined.split(/\ntokens used\b/)[0];

      const jsonMatch =
        beforeTokens.match(/```json\s*([\s\S]*?)\s*```/) ||
        beforeTokens.match(/```\s*(\{[\s\S]*?\})\s*```/) ||
        beforeTokens.match(/(\{[\s\S]*\})/s);

      if (jsonMatch) {
        resolve(jsonMatch[1].trim());
      } else {
        // Fallback terakhir: kembalikan stdout bersih jika ada
        resolve(stdout.trim() || combined.trim());
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
