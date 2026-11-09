import type { NextConfig } from "next";
import { OPEN_LIBRARY_COVER_HOST } from "./lib/cover";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: OPEN_LIBRARY_COVER_HOST,
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
