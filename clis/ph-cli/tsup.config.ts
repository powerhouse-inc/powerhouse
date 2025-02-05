import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  platform: "node",
  target: "node22",
  onSuccess: "cp -R scripts dist",
});
