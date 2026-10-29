import type { NextConfig } from "next";

// Redirect sign-in needs no wallet library: swap the adapters module for a stub
// so a redirect build neither bundles nor resolves the adapters' peer deps.
const redirectMode = process.env.NEXT_PUBLIC_RENOWN_LOGIN_MODE === "redirect";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Lets a second dev server (the redirect-mode e2e) run beside the default one.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  turbopack: redirectMode
    ? {
        resolveAlias: {
          "@/lib/wallet-adapters": "./src/lib/wallet-adapters.redirect.ts",
        },
      }
    : undefined,
};

export default nextConfig;
