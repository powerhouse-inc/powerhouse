import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    // Tooling fixture packages import this package by its published name.
    // Resolving it to source runs them without a build, on the same module
    // instances the suite imports.
    alias: [
      {
        find: /^document-model$/,
        replacement: fileURLToPath(new URL("./index.ts", import.meta.url)),
      },
      {
        find: /^document-model\/scalars$/,
        replacement: fileURLToPath(new URL("./scalars.ts", import.meta.url)),
      },
    ],
  },
  test: {
    globals: true,
  },
});
