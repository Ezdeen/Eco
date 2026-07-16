import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PRIORITY 4: TypeScript errors are NOT ignored - fix them, don't hide them
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  serverExternalPackages: ["bcryptjs", "jose", "@prisma/client", "@hashgraph/sdk"],
};

export default nextConfig;
