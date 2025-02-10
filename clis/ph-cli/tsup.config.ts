import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  platform: "node",
  target: "node20",
  format: "esm",
  onSuccess: "cp -R scripts dist",
});
