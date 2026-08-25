import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@zvec/zvec", "pdf-parse", "mammoth"]
};

export default nextConfig;
