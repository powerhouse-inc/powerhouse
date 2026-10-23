import { defineConfig } from "vitest/config";

export default defineConfig({
  root: new URL("../..", import.meta.url).pathname,
  resolve: { tsconfigPaths: true },
  test: {
    include: ["test/v2-corpus/record.ts"],
    alias: { "#": new URL("../../src/", import.meta.url).pathname },
  },
});
