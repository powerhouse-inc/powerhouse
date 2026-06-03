import { defineConfig } from "tsdown";

export default [
  defineConfig({
    entry: ["./index.ts"],
    platform: "node",
    outDir: "dist",
    outExtensions: () => ({ js: ".js" }),
    clean: true,
    dts: true,
    sourcemap: true,
  }),
  defineConfig({
    entry: { client: "./src/client.ts" },
    platform: "neutral",
    outDir: "dist",
    outExtensions: () => ({ js: ".js" }),
    clean: false,
    dts: true,
    sourcemap: true,
  }),
];
