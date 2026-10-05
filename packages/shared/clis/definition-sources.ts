import { isPlainObject } from "remeda";
import type {
  DefinitionSource,
  DefinitionSourcesConfig,
} from "../document-model/definition-types.js";

export type { DefinitionSource, DefinitionSourcesConfig };

export const DEFINITION_SOURCES_FORMAT_VERSION = 1;

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
    }
  | {
      readonly ok: false;
      readonly reason: "empty";
      readonly path: readonly string[];
    };

const ROOT = ["definitionSources"] as const;

function unsupportedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): readonly string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

/** Parses the selection envelope. The caller validates its entries. */
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
  if (value.entries.length === 0) {
    return { ok: false, reason: "empty", path: [...ROOT, "entries"] };
  }
  return { ok: true, mode: "code-first", entries: value.entries };
}

type DefinitionSourceOptionResult =
  | { readonly ok: true; readonly source: DefinitionSource }
  | {
      readonly ok: false;
      readonly reason:
        | "not-a-string"
        | "not-package-relative"
        | "percent-escape"
        | "pointer-prefix"
        | "tilde-escape";
      readonly message: string;
    };

function unescapePointerSegment(
  segment: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
  if (/~(?:[^01]|$)/.test(segment)) return { ok: false };
  return {
    ok: true,
    value: segment.replaceAll("~1", "/").replaceAll("~0", "~"),
  };
}

export function parseDefinitionSourceOption(
  value: unknown,
): DefinitionSourceOptionResult {
  if (typeof value !== "string") {
    return {
      ok: false,
      reason: "not-a-string",
      message: "A --source value must be a string.",
    };
  }
  const fragmentIndex = value.indexOf("#");
  const written = fragmentIndex < 0 ? value : value.slice(0, fragmentIndex);
  if (!written.startsWith("./")) {
    return {
      ok: false,
      reason: "not-package-relative",
      message: `"${written}" is not a package-relative path; a definition source begins with "./".`,
    };
  }
  const specifier: `./${string}` = written as `./${string}`;
  if (fragmentIndex < 0) return { ok: true, source: { specifier } };
  const fragment = value.slice(fragmentIndex + 1);

  let decoded: string;
  try {
    // RFC 6901 §6: percent-decode the fragment once, then parse the pointer.
    decoded = decodeURIComponent(fragment);
  } catch {
    return {
      ok: false,
      reason: "percent-escape",
      message: `The export fragment of "${value}" is not valid percent-encoded text.`,
    };
  }
  if (decoded === "") return { ok: true, source: { specifier } };
  if (!decoded.startsWith("/")) {
    return {
      ok: false,
      reason: "pointer-prefix",
      message: `The export fragment of "${value}" must be empty or start with "/".`,
    };
  }
  const exportPath: string[] = [];
  for (const segment of decoded.slice(1).split("/")) {
    const unescaped = unescapePointerSegment(segment);
    if (!unescaped.ok) {
      return {
        ok: false,
        reason: "tilde-escape",
        message: `The export fragment of "${value}" contains a "~" that introduces neither "~0" nor "~1".`,
      };
    }
    exportPath.push(unescaped.value);
  }
  return { ok: true, source: { specifier, exportPath } };
}
