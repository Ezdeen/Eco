import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PRIORITY 4: TypeScript errors are NOT ignored - fix them, don't hide them
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  serverExternalPackages: ["bcryptjs", "jose", "@prisma/client", "@hashgraph/sdk", "playwright"],
  // scripts/html-to-pdf.js is spawned at runtime as a separate `node` process
  // (see src/app/api/reports/[id]/pdf/route.ts), not imported as a module.
  // Next's output-file-tracing can't follow that dynamic `spawn(scriptPath)`
  // call automatically, which is what produces the
  // "Module not found: Can't resolve '/ROOT/scripts/html-to-pdf.js'" build
  // error under `output: "standalone"`. Explicitly including it here tells
  // the tracer to copy it into .next/standalone without trying to bundle it.
  outputFileTracingIncludes: {
    "/api/reports/[id]/pdf": ["./scripts/html-to-pdf.js"],
  },
};

export default nextConfig;
