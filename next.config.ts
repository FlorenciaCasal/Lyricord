import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  serverExternalPackages: ["@google-cloud/vision", "@prisma/client", "prisma"],
};

export default nextConfig;
