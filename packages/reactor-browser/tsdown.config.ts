import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["./src/index.ts", "./src/connect.ts", "./src/analytics.ts"],
  platform: "browser",
  clean: true,
  dts: { build: true },
  sourcemap: true,
  // deps: {
  //   neverBundle: ["react", "react-dom"],
  // },
});
