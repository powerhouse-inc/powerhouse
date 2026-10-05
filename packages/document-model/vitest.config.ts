import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    // Measure source, not a previously built `dist`.
    conditions: ["source"],
    alias: {
      // A definition-source fixture imports the compiler by its published
      // name, as a real package does. Without this alias the fixture loads
      // `dist` and becomes a second copy of the compiler, so every identity
      // the suite checks — above all the WeakMap holding a module's
      // compilation report — would belong to the other copy.
      "document-model": fileURLToPath(new URL("./index.ts", import.meta.url)),
    },
  },
  ssr: {
    resolve: {
      // The same conditions for the externalized graph. `resolve.conditions`
      // alone governs what Vite transforms; a workspace dependency vitest
      // hands to Node still resolved to its built `dist`, so editing shared
      // source changed nothing here until a rebuild.
      conditions: ["source", "import", "module", "default"],
    },
  },
  test: {
    globals: true,
  },
});
