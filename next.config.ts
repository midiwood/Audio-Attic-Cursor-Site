import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Local WAV/MP3 imports can exceed the default ~10MB body buffer used when
  // middleware clones request bodies (truncation → FormData parse failure).
  experimental: {
    middlewareClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
