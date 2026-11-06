import { isPlainObject } from "remeda";
import type {
  DefinitionSource,
  DefinitionSourcesConfig,
} from "../document-model/definition-types.js";

export type { DefinitionSource, DefinitionSourcesConfig };

/**
 * @experimental Which authoring path a package's document models take.
 * Experimental because code-first projects are still being introduced.
 */
export type AuthoringMode = DefinitionSourcesConfig["mode"];

/**
 * @experimental The authoring mode used when neither `--code-first` nor
 * `definitionSources` selects one. Codegen and tooling read this constant;
 * the CLI delegates to codegen.
 */
export const DEFAULT_AUTHORING_MODE: AuthoringMode = "schema-first";

/** @experimental The only `definitionSources.formatVersion` this release reads. */
export const DEFINITION_SOURCES_FORMAT_VERSION = 1;

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

const DEFINITION_SOURCES_MODES = ["code-first", "schema-first"] as const;

type DefinitionSourcesParseResult =
  | {
      readonly ok: true;
      readonly mode: "code-first";
      readonly entries: readonly unknown[];
    }
  | { readonly ok: true; readonly mode: "schema-first" }
  | {
      readonly ok: false;
      readonly reason: "missing";
      readonly path: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: "unsupported-version";
      readonly path: readonly string[];
      readonly received: unknown;
    }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly path: readonly string[];
      readonly expected: string;
      readonly received: unknown;
    };

const ROOT = ["definitionSources"] as const;

function unsupportedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): readonly string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

/**
 * @experimental Parses the `definitionSources` envelope. Its entries stay
 * unparsed, because only the loader knows the package root they resolve
 * against.
 */
export function parseDefinitionSourcesConfig(
  value: unknown,
): DefinitionSourcesParseResult {
  if (value === undefined) {
    return { ok: false, reason: "missing", path: ROOT };
  }
  if (!isPlainObject(value)) {
    return {
      ok: false,
      reason: "invalid",
      path: ROOT,
      expected: "an object with formatVersion, mode, and entries",
      received: value,
    };
  }
  if (value.formatVersion !== DEFINITION_SOURCES_FORMAT_VERSION) {
    return {
      ok: false,
      reason: "unsupported-version",
      path: [...ROOT, "formatVersion"],
      received: value.formatVersion,
    };
  }
  if (value.mode === "schema-first") {
    const extra = unsupportedKeys(value, ["formatVersion", "mode"]);
    if (extra.length > 0) {
      return {
        ok: false,
        reason: "invalid",
        path: ROOT,
        expected: "formatVersion and mode only",
        received: extra,
      };
    }
    return { ok: true, mode: "schema-first" };
  }
  if (value.mode !== "code-first") {
    return {
      ok: false,
      reason: "invalid",
      path: [...ROOT, "mode"],
      expected: DEFINITION_SOURCES_MODES.join(" or "),
      received: value.mode,
    };
  }
  const extra = unsupportedKeys(value, ["formatVersion", "mode", "entries"]);
  if (extra.length > 0) {
    return {
      ok: false,
      reason: "invalid",
      path: ROOT,
      expected: "formatVersion, mode, and entries",
      received: extra,
    };
  }
  if (!Array.isArray(value.entries)) {
    return {
      ok: false,
      reason: "invalid",
      path: [...ROOT, "entries"],
      expected: "an array of definition source entries",
      received: value.entries,
    };
  }
  return { ok: true, mode: "code-first", entries: value.entries };
}
