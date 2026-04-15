import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@google-cloud/vision", "@prisma/client", "prisma"],
};

export default nextConfig;
