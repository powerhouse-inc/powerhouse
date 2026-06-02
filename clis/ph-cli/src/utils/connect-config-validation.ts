// Ajv-backed validation for `ph connect config` writes.
//
// Two entry points:
//
//   - validateConnectKeyValue(key, value)
//     For the `<key> <value>` form. Sets the value at the dotted path inside a
//     stub connect block, then validates the result against the runtime schema.
//     Catches both invalid paths (key doesn't map to a real field) and invalid
//     types (e.g. `connect.renown.chainId "abc"` — schema says number).
//
//   - validateConnectPatch(patch)
//     For the `--json` form. Validates the whole patch as a partial connect.*
//     blob. Same schema, but we only check the keys actually present in the
//     patch (additional keys still fail per `additionalProperties: false`).
//
// Both return a typed `connect.*` partial on success or throw with a multi-
// line, actionable message on failure.

import { phConnectRuntimeConfigSchema } from "@powerhousedao/shared/connect";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import AjvNs from "ajv";
import { isPlainObject, stringToPath } from "remeda";

type PlainObject = Record<string, unknown>;
type ConnectPartial = Partial<PHConnectRuntimeConfig>;

// Ajv ships as CJS — under NodeNext ESM the default lands on `.default` while
// types still point at the class on the namespace. Normalize the constructor.
type AjvCtor = new (opts?: Record<string, unknown>) => {
  compile: (schema: unknown) => AjvValidate;
};
type AjvError = { instancePath?: string; message?: string };
type AjvValidate = ((data: unknown) => boolean) & {
  errors?: AjvError[] | null;
};

const Ajv = ((AjvNs as unknown as { default?: AjvCtor }).default ??
  (AjvNs as unknown as AjvCtor)) as AjvCtor;

const ajv = new Ajv({ allErrors: true, strict: false });
const validateConnect: AjvValidate = ajv.compile(phConnectRuntimeConfigSchema);

/**
 * Parse the CLI-supplied value. Tries JSON first so `true`, `42`, `"a"`,
 * `null`, `[1,2]` coerce; falls back to the raw string for unquoted text.
 *
 * Examples:
 *   "true"  -> true (boolean)
 *   "42"    -> 42 (number)
 *   '"x"'   -> "x" (string, quoted)
 *   "x"     -> "x" (string, bare)
 *   "[1,2]" -> [1, 2] (array)
 */
export function parseCliValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Strip the optional leading "connect." prefix so callers can pass either
 * "connect.renown.url" or "renown.url" interchangeably.
 */
export function normalizeKey(key: string): string {
  return key.startsWith("connect.") ? key.slice("connect.".length) : key;
}

function formatErrors(errors: AjvError[] | null | undefined): string {
  if (!errors || errors.length === 0) return "unknown validation error";
  return errors
    .map((e) => {
      const path = e.instancePath || "(root)";
      return `  ${path} ${e.message ?? ""}`.trim();
    })
    .join("\n");
}

/**
 * Validate a single `<key> <value>` pair. Returns the parsed connect-partial
 * that, when deep-merged into the existing config, applies the change.
 *
 * Throws on:
 *   - Empty key
 *   - Path that doesn't exist in the schema
 *   - Value whose type doesn't match the schema at the leaf path
 */
export function validateConnectKeyValue(
  key: string,
  rawValue: string,
): ConnectPartial {
  const normalized = normalizeKey(key);
  if (!normalized) {
    throw new Error(
      "ph connect config: key cannot be empty. Pass a dotted path inside connect.* (e.g. connect.renown.url).",
    );
  }
  const parsed = parseCliValue(rawValue);
  // Build a nested-stub object from the dotted path so Ajv can validate
  // the value's shape against the schema (e.g. "renown.url" + parsed →
  // { renown: { url: parsed } }). Remeda's `setPath` requires the path
  // to exist; this is the sparse-creation case, so we fold the parts.
  const stub = stringToPath(normalized).reduceRight<unknown>(
    (acc, key) => ({ [String(key)]: acc }),
    parsed,
  ) as PlainObject;
  if (!validateConnect(stub)) {
    throw new Error(
      `ph connect config: validation failed for key="${normalized}" value=${JSON.stringify(parsed)} (parsed as ${typeof parsed}):\n${formatErrors(validateConnect.errors)}`,
    );
  }
  return stub;
}

/**
 * Validate a `--json` bulk override. Returns the parsed partial.
 *
 * `packageRegistryUrl` is a top-level runtime field (not part of the
 * `connect.*` schema). If present in the payload, it is extracted before
 * validation so the connect-only blob can be checked against the schema,
 * then re-attached on the returned object so the caller can route it.
 */
export function validateConnectPatch(raw: string): ConnectPartial & {
  packageRegistryUrl?: unknown;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `ph connect config --json: invalid JSON (${msg}). Expected a partial connect.* blob, e.g. --json '{"renown":{"url":"..."}}'.`,
      { cause: e },
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `ph connect config --json: payload must be a JSON object, got ${typeof parsed}.`,
    );
  }
  // Extract `packageRegistryUrl` (top-level field, not in the connect schema)
  // before validating, so a payload like `{"packageRegistryUrl":"…"}` doesn't
  // fail the `additionalProperties: false` check on the connect schema.
  const top = parsed as PlainObject;
  const hasPackageRegistryUrl = Object.prototype.hasOwnProperty.call(
    top,
    "packageRegistryUrl",
  );
  const packageRegistryUrl = top.packageRegistryUrl;
  const connectOnly: PlainObject = { ...top };
  delete connectOnly.packageRegistryUrl;
  if (!validateConnect(connectOnly)) {
    throw new Error(
      `ph connect config --json: validation failed:\n${formatErrors(validateConnect.errors)}`,
    );
  }
  return hasPackageRegistryUrl
    ? ({ ...connectOnly, packageRegistryUrl } as ConnectPartial & {
        packageRegistryUrl?: unknown;
      })
    : (connectOnly as ConnectPartial);
}
