import { defineProject } from "vitest/config";

export default defineProject({
  ssr: {
    resolve: {
      conditions: ["source"],
    },
  },
  resolve: {
    conditions: ["source"],
  },
  test: {
    globals: true,
  },
});
