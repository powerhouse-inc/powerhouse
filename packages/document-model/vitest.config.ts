import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    // No vi.mock and no global assignment in this suite, so test files can
    // share a module registry instead of re-instantiating it per file.
    isolate: false,
    globals: true,
  },
});
