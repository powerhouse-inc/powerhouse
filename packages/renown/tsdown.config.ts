import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/node.ts",
    "src/crypto.ts",
    "src/wallet/index.ts",
    "src/wallet/rainbow/index.ts",
    "src/wallet/privy/index.ts",
    "src/wallet/mock/index.ts",
  ],
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: true,
  sourcemap: true,
  deps: {
    // Keep the optional wallet-lib peer deps external so they only load when a
    // consumer imports the adapter subexport (the lazy mechanism).
    neverBundle: [
      /^node:/,
      "react",
      "wagmi",
      // Regex so subpaths stay external too (e.g. the "/styles.css" import the
      // rainbow adapter pulls in — the host bundler resolves it lazily).
      /^@rainbow-me\/rainbowkit(\/.*)?$/,
      "@tanstack/react-query",
      "@privy-io/react-auth",
    ],
  },
});
