import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Folder build bisa dialihkan lewat env.
  //
  // Alasannya: aplikasi ini dilayani pm2 langsung dari folder project. Menjalankan
  // "npm run build" di sini saat aplikasi hidup akan mengganti isi .next dengan
  // nama file baru, sementara proses yang berjalan masih memegang daftar file lama.
  // Akibatnya CSS dan JS balas 500 dan situs tampil tanpa gaya sama sekali.
  //
  // Untuk sekadar memverifikasi kode bisa di-build, pakai: npm run build:check
  // (membangun ke .next-check, tidak menyentuh build yang sedang dipakai).
  // Folder .next hanya boleh ditulis oleh scripts/deploy_aqma.sh, yang langsung
  // me-restart pm2 setelahnya.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        // Cegah browser cache halaman HTML supaya server action ID selalu fresh setelah deploy
        source: "/((?!_next/static|_next/image|favicon\\.ico).*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
