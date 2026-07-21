import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./index.mts"],
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  // The hand-written service worker is NOT bundled — it is copied verbatim into
  // dist/service-worker/ (the `service-worker` dir keeps its basename under
  // `to`) so vite-plugin-pwa's injectManifest pass can compile it at the
  // consumer's build time. connectPwaPlugins resolves it relative to the
  // bundled entry (dist/index.mjs → ./service-worker).
  copy: [{ from: "./connect-utils/service-worker", to: "./dist" }],
});
