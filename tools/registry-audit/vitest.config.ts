import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tools/registry-audit/*.test.ts"] },
});
