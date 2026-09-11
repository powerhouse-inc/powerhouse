// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as RuntimeConfig from "../src/runtime-config.js";

/**
 * The bootstrap paints the skeleton *before* `loadRuntimeConfig()` resolves,
 * so every module it pulls in has to be evaluable with a cold config cache.
 * That invariant is what makes `app-skeleton.tsx` import `../utils/browser.js`
 * and `../hooks/useIsEmbedded.js` as leaf modules rather than through the
 * `@powerhousedao/connect/{utils,hooks}` barrels — the barrels reach modules
 * that call `getRuntimeConfig()` at module scope.
 *
 * Nothing enforced it. A single barrel import added to either file breaks
 * startup at runtime, with a TypeError from deep inside a re-export chain and
 * a blank page — a failure that no other test in this package can see.
 *
 * So: make `getRuntimeConfig()` throw, then evaluate the graph. Reading the
 * config at module scope fails the import, and the message says which call it
 * was. Calls made *later* (from a component render, a hook, an event handler)
 * are untouched — those run after the config is warm, which is exactly the
 * distinction the invariant draws.
 */
vi.mock("../src/runtime-config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeConfig>();
  return {
    ...actual,
    getRuntimeConfig: () => {
      throw new Error(
        "getRuntimeConfig() was called while evaluating a module that the " +
          "bootstrap loads before the runtime config is fetched. Import the " +
          "leaf module you need instead of a barrel that re-exports it.",
      );
    },
  };
});

// Evaluating the skeleton pulls in the design-system and reactor-browser
// graphs, which take a few seconds to transform on a cold vite cache.
const IMPORT_TIMEOUT = 60_000;

describe("the pre-config import graph", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it(
    "evaluates the app skeleton without reading the runtime config",
    async () => {
      await expect(
        import("../src/components/app-skeleton.js"),
      ).resolves.toBeDefined();
    },
    IMPORT_TIMEOUT,
  );

  it(
    "evaluates the bootstrap without reading the runtime config",
    async () => {
      await expect(import("../src/boot.js")).resolves.toBeDefined();
    },
    IMPORT_TIMEOUT,
  );

  it(
    "evaluates the performance observer without reading the runtime config",
    async () => {
      // It is the very first import the bootstrap makes, ahead of the skeleton.
      await expect(
        import("../src/utils/performance-observer.js"),
      ).resolves.toBeDefined();
    },
    IMPORT_TIMEOUT,
  );
});
