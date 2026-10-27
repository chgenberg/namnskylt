import type { NextConfig } from "next";

/** Fontfiler och HDRI byts aldrig på plats — nytt innehåll får nytt filnamn. */
const IMMUTABLE = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["three"],
  // Nativa moduler och webbläsarstyrning — ska laddas av Node, inte buntas.
  serverExternalPackages: ["@resvg/resvg-js", "sharp", "playwright-core"],
  // API:t läser fontfilerna från disk; serverless-paket tar annars inte med public/.
  outputFileTracingIncludes: {
    "/api/**": ["./public/fonts/**"],
  },
  async headers() {
    return [
      { source: "/fonts/:file*", headers: IMMUTABLE },
      { source: "/hdri/:file*", headers: IMMUTABLE },
    ];
  },
};

export default nextConfig;
