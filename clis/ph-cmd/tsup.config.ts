import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "tsup";

const packageJsonPath = path.resolve(__dirname, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
  version: string;
};

const appVersion = packageJson.version;

export default defineConfig({
  entry: ["src/**/*"],
  platform: "node",
  target: "node20",
  format: "esm",
  define: {
    "process.env.APP_VERSION": JSON.stringify(appVersion),
  },
});
