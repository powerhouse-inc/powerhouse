import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    alias: {
      "#utils/env": new URL("./src/document/utils/node.ts", import.meta.url)
        .pathname,
      "#": new URL("./src/", import.meta.url).pathname,
    },
  },
});
