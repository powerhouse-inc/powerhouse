import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// The "source" condition resolves workspace packages (clint, document-model,
// reactor-browser) and this package's own exports (the chat module imports
// `@powerhousedao/clint-common/document-models/chat-session`) to their
// TypeScript sources, so tests run without any dist/ having been built first.
const conditions = ["source", "import", "module", "default"];
// Node tests load clint from source, and through it the AWS SDK, whose export
// maps list "module" (a bundler build Node cannot load) first: Node's own
// "node" condition instead.
const nodeConditions = ["source", "node", "import", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions: nodeConditions } },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["document-models/**/src/reducers/**"],
      thresholds: {
        lines: 95,
        branches: 95,
        functions: 95,
        statements: 95,
      },
    },
  },
  plugins: [tsconfigPaths(), react()],
});
