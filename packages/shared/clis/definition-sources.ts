import type { DefinitionSource } from "../document-model/definition-types.js";

export type { DefinitionSource };

/**
 * @experimental The extensions a definition source may have. Hosts evaluate
 * every source as an ES module.
 */
export const DEFINITION_SOURCE_EXTENSION = /\.(?:[jt]sx?|m[jt]s)$/;

/** @experimental A CommonJS module, which cannot be a definition source. */
export const COMMONJS_DEFINITION_SOURCE = /\.c[jt]s$/;

/** @experimental How to make a CommonJS module a definition source. */
export const COMMONJS_DEFINITION_SOURCE_REPAIR =
  "Rename the module to .ts, .mts, .js or .mjs and declare its definitions with ES module exports.";

/**
 * @experimental The entry file names a code-first model directory may use,
 * in the order a reader lists them. A directory with more than one is
 * ambiguous.
 */
export const DOCUMENT_MODEL_ENTRY_FILES = [
  "index.ts",
  "index.mts",
  "index.tsx",
  "index.js",
  "index.mjs",
  "index.jsx",
] as const;
