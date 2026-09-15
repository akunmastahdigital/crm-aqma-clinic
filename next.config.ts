import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
