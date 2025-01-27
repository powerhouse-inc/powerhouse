import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";
import path from "node:path";

const packageJsonPath = path.resolve(__dirname, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
  version: string;
};

const appVersion = packageJson.version;

export default defineConfig({
  entry: ["src/**/*.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: "esm",
  treeshake: true,
  bundle: false,
  platform: "node",
  target: "node20",
  cjsInterop: true,
  dts: true,
  define: {
    "process.env.APP_VERSION": JSON.stringify(appVersion),
  },
});
