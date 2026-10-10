import type { DefinitionPath } from "@powerhousedao/shared/document-model";
import { snapshotDataRecord } from "./data-properties.js";
import {
  DefinitionDiagnosticCollector,
  type DefinitionDiagnosticCode,
} from "./diagnostics.js";
import { isNFC } from "./primitives.js";

/**
 * The compatibility surface a code-first declaration uses when it has to be
 * equivalent to an existing schema-first model, down to the persisted bytes.
 *
 * Three modes, independent of each other. Selecting one never enables
 * another:
 *
 * | Mode            | Selected by                  | Effect                                            |
 * | --------------- | ---------------------------- | ------------------------------------------------- |
 * | `identity`      | `ids`                        | Stored IDs replace the derived UUIDv5 values       |
 * | `serialization` | `serialization`              | Exact stored SDL and JSON strings are retained     |
 * | GraphQL         | `specifications.graphQLCompatibility` | GraphQL projects from the recorded AST   |
 *
 * Every mode still uses the installed `document-engineering-1.40` scalar
 * behavior and preserves unknown document keys.
 *
 * Nothing here is trusted. An identity override has to be complete, unique,
 * and claimed; a retained string has to describe the same structure as the
 * declaration. There is no force flag.
 */

/** Per-name overrides for a stored name the derivation rules would not produce. */
export type ModuleNameOverrides = {
  readonly storedName?: string;
};

export type OperationNameOverrides = {
  readonly storedName?: string;
  readonly actionType?: string;
  readonly inputTypeName?: string;
};

export type NameOverrides = ModuleNameOverrides & OperationNameOverrides;

export type SchemaFirstCompatibilityInput<
  TNames extends Readonly<Record<string, NameOverrides>> = Readonly<
    Record<string, NameOverrides>
  >,
> = {
  /** Identity path (`module/lineItems`) to the exact stored ID. */
  readonly ids?: Readonly<Record<string, string>>;
  /** Identity path to the stored names the derivation would not produce. */
  readonly names?: TNames;
  /**
   * Serialization path to the exact stored string:
   * `state/global/schema`, `state/global/initialValue`,
   * `state/local/schema`, `state/local/initialValue`, and
   * `operation/<module>/<operation>/schema`.
   */
  readonly serialization?: Readonly<Record<string, string>>;
};

declare const compatibilityBrand: unique symbol;

export type SchemaFirstSpecificationCompatibility<
  TNames extends Readonly<Record<string, NameOverrides>> = Readonly<
    Record<string, NameOverrides>
  >,
> = {
  readonly kind: "powerhouse.schema-first-compatibility";
  readonly ids: ReadonlyMap<string, string>;
  readonly names: ReadonlyMap<string, NameOverrides>;
  readonly serialization: ReadonlyMap<string, string>;
  readonly [compatibilityBrand]?: TNames;
};

const MODULE_NAME_KEYS = ["storedName"] as const;
const OPERATION_NAME_KEYS = [
  "storedName",
  "actionType",
  "inputTypeName",
] as const;
const NAME_KEYS = [...new Set([...MODULE_NAME_KEYS, ...OPERATION_NAME_KEYS])];

const SERIALIZATION_PATH =
  /^(?:state\/(?:global|local)\/(?:schema|initialValue)|operation\/[^/]+\/[^/]+\/schema)$/;

const IDENTITY_PATH =
  /^(?:module\/[^/]+|operation\/[^/]+\/[^/]+|error\/[^/]+\/[^/]+\/[^/]+|state-example\/(?:global|local)\/[^/]+|operation-example\/[^/]+\/[^/]+\/[^/]+)$/;

function stringMap(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
  member: "ids" | "serialization",
  code: DefinitionDiagnosticCode,
  keyPattern: RegExp,
  keyShape: string,
): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  if (value === undefined) return entries;
  const snapshot = snapshotDataRecord(value, undefined, [member]);
  if (!snapshot.ok) {
    collector.add({
      code,
      path: snapshot.path,
      message: `The ${member} map must be a plain object of strings (${snapshot.reason}).`,
      expected: `{ "${keyShape}": "..." }`,
      received: value === null ? "null" : typeof value,
      repair: `Pass ${member} as an object literal keyed by ${keyShape}.`,
    });
    return entries;
  }
  for (const [key, entry] of Object.entries(snapshot.value)) {
    const path: DefinitionPath = [member, key];
    if (!keyPattern.test(key)) {
      collector.add({
        code,
        path,
        message: `${JSON.stringify(key)} is not a ${member === "ids" ? "identity" : "serialization"} path.`,
        expected: keyShape,
        received: key,
        repair: `Key the entry by its path, as ${keyShape}.`,
      });
      continue;
    }
    // An identity override names something; a serialization override is a
    // stored byte sequence, and an empty one is what a model with no local
    // schema actually stores.
    const malformed =
      typeof entry !== "string" ||
      !isNFC(entry) ||
      (member === "ids" && entry.trim() === "");
    if (malformed) {
      collector.add({
        code,
        path,
        message:
          member === "ids"
            ? "An identity override must be a nonempty string already in Unicode NFC."
            : "A serialization override must be a string already in Unicode NFC.",
        expected: member === "ids" ? "a nonempty NFC string" : "an NFC string",
        received:
          typeof entry === "string" ? JSON.stringify(entry) : typeof entry,
        repair:
          member === "ids"
            ? "Copy the exact stored ID from the model this declaration replaces."
            : "Copy the exact stored string from the model this declaration replaces.",
      });
      continue;
    }
    if (typeof entry !== "string") continue;
    entries.set(key, entry);
  }
  return entries;
}

function nameMap(
  collector: DefinitionDiagnosticCollector,
  value: unknown,
): ReadonlyMap<string, NameOverrides> {
  const entries = new Map<string, NameOverrides>();
  if (value === undefined) return entries;
  const snapshot = snapshotDataRecord(value, undefined, ["names"]);
  if (!snapshot.ok) {
    collector.add({
      code: "PH-DM-COMPATIBILITY-INVALID",
      path: snapshot.path,
      message: `The names map must be a plain object (${snapshot.reason}).`,
      expected: '{ "module/lineItems": { storedName: "line_items" } }',
      received: value === null ? "null" : typeof value,
      repair: "Pass names as an object literal keyed by identity path.",
    });
    return entries;
  }
  for (const [key, entry] of Object.entries(snapshot.value)) {
    const path: DefinitionPath = ["names", key];
    if (!/^(?:module\/[^/]+|operation\/[^/]+\/[^/]+)$/.test(key)) {
      collector.add({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path,
        message: `${JSON.stringify(key)} is not a module or operation identity path.`,
        expected: "module/<moduleKey> or operation/<moduleKey>/<operationKey>",
        received: key,
        repair: "Only a module or an operation carries stored names.",
      });
      continue;
    }
    const allowed = key.startsWith("module/")
      ? MODULE_NAME_KEYS
      : OPERATION_NAME_KEYS;
    const overrides = snapshotDataRecord(entry, NAME_KEYS, path);
    if (!overrides.ok) {
      collector.add({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: overrides.path,
        message: `A name override must be a plain object (${overrides.reason}).`,
        expected: allowed.join(", "),
        received: entry === null ? "null" : typeof entry,
        repair: `Use ${allowed.map((name) => `${name}: "..."`).join(" or ")}.`,
      });
      continue;
    }
    const resolved: Record<string, string> = {};
    for (const [name, override] of Object.entries(overrides.value)) {
      if (!(allowed as readonly string[]).includes(name)) {
        collector.add({
          code: "PH-DM-COMPATIBILITY-INVALID",
          path: [...path, name],
          message: `${name} is not a stored name of this declaration.`,
          expected: allowed.join(", "),
          received: name,
          repair: `Override only ${allowed.join(", ")}; the other derived names never reach the stored specification.`,
        });
        continue;
      }
      if (typeof override !== "string" || !isNFC(override)) {
        collector.add({
          code: "PH-DM-COMPATIBILITY-INVALID",
          path: [...path, name],
          message:
            "A stored name override must be a string already in Unicode NFC.",
          expected: "string",
          received: typeof override,
          repair: "Copy the exact stored name from the model this replaces.",
        });
        continue;
      }
      resolved[name] = override;
    }
    entries.set(key, resolved);
  }
  return entries;
}

/**
 * Builds the compatibility data a migrated declaration carries. The migration
 * command that emits these maps is deferred; the surface that accepts one is
 * needed now, because without it "backward compatible" is not expressible.
 */
export function schemaFirstSpecification<
  const TNames extends Readonly<Record<string, NameOverrides>> = Record<
    never,
    never
  >,
>(
  input: SchemaFirstCompatibilityInput<TNames>,
): SchemaFirstSpecificationCompatibility<TNames> {
  const collector = new DefinitionDiagnosticCollector();
  const config = snapshotDataRecord(
    input,
    ["ids", "names", "serialization"],
    [],
  );
  if (!config.ok) {
    collector.add({
      code: "PH-DM-COMPATIBILITY-INVALID",
      path: config.path,
      message: `The compatibility declaration must be a plain object (${config.reason}).`,
      expected: "ids, names, serialization",
      // An untyped caller can still pass null here.
      received: (input as unknown) === null ? "null" : typeof input,
      repair:
        "Pass schemaFirstSpecification({ ids, names, serialization }) with object literals.",
    });
    collector.throwIfFailed();
  }
  const ids = stringMap(
    collector,
    config.ok ? config.value.ids : undefined,
    "ids",
    "PH-DM-IDENTITY-INVALID",
    IDENTITY_PATH,
    "module/<key>, operation/<module>/<key>, error/…, state-example/…, operation-example/…",
  );
  const serialization = stringMap(
    collector,
    config.ok ? config.value.serialization : undefined,
    "serialization",
    "PH-DM-COMPATIBILITY-INVALID",
    SERIALIZATION_PATH,
    "state/<scope>/<schema|initialValue> or operation/<module>/<operation>/schema",
  );
  const names = nameMap(collector, config.ok ? config.value.names : undefined);
  collector.throwIfFailed();
  return {
    kind: "powerhouse.schema-first-compatibility",
    ids,
    names,
    serialization,
  };
}

/** True when the value came from `schemaFirstSpecification`. */
export function isSchemaFirstCompatibility(
  value: unknown,
): value is SchemaFirstSpecificationCompatibility {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { readonly kind?: unknown }).kind ===
      "powerhouse.schema-first-compatibility" &&
    (value as { readonly ids?: unknown }).ids instanceof Map
  );
}
