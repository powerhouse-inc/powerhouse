import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["start-connect.tsx", "main.tsx", "pglite.worker.ts"],
  platform: "browser",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  deps: {
    neverBundle: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-dom/client",
    ],
  },
});
