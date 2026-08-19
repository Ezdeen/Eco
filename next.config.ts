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
  // (see src/app/api/reports/[id]/pdf/route.ts and
  // src/app/api/portfolio-reports/[id]/pdf/route.ts), not imported as a module.
  // Next's output-file-tracing can't follow that dynamic `spawn(scriptPath)`
  // call automatically, which is what produces the
  // "Module not found: Can't resolve '/ROOT/scripts/html-to-pdf.js'" build
  // error under `output: "standalone"`. Explicitly including it here tells
  // the tracer to copy it into .next/standalone without trying to bundle it.
  //
  // The script itself does `require('playwright')` — that's a second hop the
  // tracer also can't follow (it only traces imports reachable from the Next.js
  // route graph, and this require happens inside a file that's merely copied,
  // not imported). Without the explicit "./node_modules/playwright/**" glob
  // below, the script file gets copied into .next/standalone but its
  // 'playwright' dependency does not, producing exactly this failure at
  // runtime: "Cannot find module 'playwright'" (MODULE_NOT_FOUND), even though
  // the script itself was found and started executing. Both PDF routes must
  // list the same two globs, since each is traced independently.
  outputFileTracingIncludes: {
    "/api/reports/[id]/pdf": [
      "./scripts/html-to-pdf.js",
      "./node_modules/playwright/**",
      "./node_modules/playwright-core/**",
    ],
    "/api/portfolio-reports/[id]/pdf": [
      "./scripts/html-to-pdf.js",
      "./node_modules/playwright/**",
      "./node_modules/playwright-core/**",
    ],
  },
};

export default nextConfig;
