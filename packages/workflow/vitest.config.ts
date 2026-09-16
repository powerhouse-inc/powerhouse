import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// The "source" condition resolves workspace packages to their TypeScript
// sources, so tests run without any dist/ having been built first.
const conditions = ["source", "import", "module", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    include: [
      "editors/**/*.test.ts",
      "editors/**/*.test.tsx",
      "document-models/**/*.test.ts",
      "ai/**/*.test.ts",
      "pieces/**/*.test.ts",
    ],
    globals: true,
    server: {
      deps: {
        // The condition above also picks the TypeScript "source" export of
        // third-party packages (eventsource-parser, via the AI SDK), which
        // node refuses to strip types for under node_modules — so Vite has to
        // transform every dependency rather than externalize any of them.
        inline: true,
      },
    },
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
  plugins: [tsconfigPaths()],
});
