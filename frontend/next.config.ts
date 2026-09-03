import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/jm3",
  allowedDevOrigins: [
    "127.0.0.1",
    "100.83.172.126",
    "hrtt.dpdns.org",
    "api.hrtt.dpdns.org",
  ],
};

export default nextConfig;
