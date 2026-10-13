import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    server: {
      deps: {
        // vitest inlines workspace links. Emitted definition modules import
        // `document-model` through Node, so an inlined copy is a second instance.
        external: ["document-model"],
      },
    },
  },
});
