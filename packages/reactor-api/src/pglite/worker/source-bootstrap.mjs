// Worker script used when ThreadedPGlite runs from its TypeScript source (the
// monorepo's `source` export condition): loads the entry through tsx. Built
// packages use dist/src/pglite/worker/entry.mjs instead.
import { register } from "tsx/esm/api";

register();

await import("./entry.ts");
