import type {
  DefinitionPath,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import {
  type DataPath,
  type DataSnapshotRejection,
  type DataValue,
  snapshotArray,
  snapshotDataRecord,
  snapshotRecord,
} from "./data-properties.js";
import {
  isFieldDescriptor,
  isScalarFactory,
  isTypeDescriptor,
  registerFieldDescriptor,
} from "./descriptor-registry.js";
import {
  type DefinitionDiagnosticCode,
  failDefinition,
} from "./diagnostics.js";
import { canonicalJson, isAuthoredSchemaName } from "./primitives.js";
import {
  type AnyFieldDescriptor,
  type AnyTypeDescriptor,
  FIELD_USE_ROLE,
  type FieldDefault,
  type FieldOptions,
  type FieldPresentation,
  type Nullable,
  type ScalarDescriptor,
} from "./types.js";
import type { ScalarBinding } from "./scalars/types.js";
import { buildValidator } from "./zod.js";

export const FIELD_OPTION_KEYS = Object.freeze([
  "required",
  "description",
  "deprecated",
  "defaultValue",
] as const);

const LIST_ITEM_METADATA_KEYS = ["description", "deprecated", "defaultValue"];

function rejectionPath(rejection: DataSnapshotRejection): DefinitionPath {
  return rejection.path.map((segment) =>
    typeof segment === "number" ? segment : String(segment),
  );
}

export function optionRejection(
  rejection: DataSnapshotRejection,
  unsupportedKeyCode: DefinitionDiagnosticCode,
  allowedKeys: readonly string[],
): never {
  if (rejection.reason === "unknown-key") {
    return failDefinition({
      code: unsupportedKeyCode,
      path: rejectionPath(rejection),
      message: `Option ${JSON.stringify(rejection.key)} is not supported here.`,
      expected: allowedKeys.join(", "),
      received: rejection.key,
      repair: `Remove ${JSON.stringify(rejection.key)}; the supported options are ${allowedKeys.join(", ")}.`,
    });
  }
  return failDefinition({
    code: "PH-DEF-OPTION-INVALID",
    path: rejectionPath(rejection),
    message: `The option value could not be snapshotted (${rejection.reason}).`,
    received: rejection.reason,
    repair:
      "Pass a plain object literal with enumerable string-keyed data properties and no accessors, symbols, or class instances.",
  });
}

/** Snapshots plain JSON-like options and rejects unknown keys with the given code. */
export function snapshotDataOptions(
  value: unknown,
  allowedKeys: readonly string[],
  path: DataPath,
  unsupportedKeyCode: DefinitionDiagnosticCode = "PH-DEF-OPTION-INVALID",
): { readonly [key: string]: DataValue } {
  const snapshot = snapshotDataRecord(value, allowedKeys, path);
  if (!snapshot.ok)
    return optionRejection(snapshot, unsupportedKeyCode, allowedKeys);
  return snapshot.value;
}

/** Snapshots options whose members may be descriptors, thunks, or arrays. */
export function snapshotDescriptorOptions(
  value: unknown,
  allowedKeys: readonly string[],
  path: DataPath,
): { readonly [key: string]: unknown } {
  const snapshot = snapshotRecord(value, allowedKeys, path);
  if (!snapshot.ok)
    return optionRejection(snapshot, "PH-DEF-OPTION-INVALID", allowedKeys);
  return snapshot.value;
}

export function snapshotDescriptorArray(
  value: unknown,
  path: DataPath,
  code: DefinitionDiagnosticCode,
  repair: string,
): readonly unknown[] {
  const snapshot = snapshotArray(value, path);
  if (snapshot.ok) return snapshot.value;
  if (snapshot.reason === "not-array") {
    return failDefinition({
      code,
      path,
      message: "Expected an array.",
      received: value === null ? "null" : typeof value,
      repair,
    });
  }
  return optionRejection(snapshot, code, []);
}

/** Snapshots a `fields` map whose keys are authored and whose members are opaque. */
export function snapshotFieldMap(
  value: unknown,
  path: DataPath,
): { readonly [key: string]: unknown } {
  const ownKeys =
    value !== null && typeof value === "object"
      ? Reflect.ownKeys(value).filter((key) => typeof key === "string")
      : [];
  return snapshotDescriptorOptions(value, ownKeys, path);
}

export function assertAuthoredName(value: unknown, path: DataPath): string {
  if (!isAuthoredSchemaName(value)) {
    return failDefinition({
      code: "PH-DEF-NAME-INVALID",
      path,
      message:
        "A GraphQL name must match /^[_A-Za-z][_0-9A-Za-z]*$/ and must not start with two underscores.",
      expected: "a GraphQL name such as InvoiceLineItem",
      received: typeof value === "string" ? value : typeof value,
      repair:
        "Use letters, digits, and underscores, start with a letter or one underscore, and avoid the reserved __ prefix.",
    });
  }
  return value;
}

export function assertFieldUse(
  value: unknown,
  path: DataPath,
): asserts value is AnyFieldDescriptor {
  if (isFieldDescriptor(value)) return;
  if (isScalarFactory(value)) {
    const role = (value as { readonly role: string }).role;
    failDefinition({
      code: "PH-SCALAR-FACTORY-AS-FIELD",
      path,
      message: "A scalar factory was used as a field without being called.",
      expected: FIELD_USE_ROLE,
      received: role,
      repair: role.slice(role.indexOf("call it, as ") + "call it, as ".length),
    });
  }
  if (isTypeDescriptor(value)) {
    failDefinition({
      code: "PH-DEF-TYPE-AS-FIELD",
      path,
      message: `Named type ${JSON.stringify(value.name)} was used directly as a field.`,
      expected: FIELD_USE_ROLE,
      received: value.role,
      repair: `Wrap the type with ph.ref(${value.name ?? "Type"}).`,
    });
  }
  failDefinition({
    code: "PH-DEF-FIELD-INVALID",
    path,
    message: "A field position must hold a field use created by ph.",
    received: value === null ? "null" : typeof value,
    repair:
      "Use a called scalar factory such as ph.String(), ph.list(...), or ph.ref(Type).",
  });
}

export function assertNamedType(
  value: unknown,
  path: DataPath,
  code: DefinitionDiagnosticCode,
  repair: string,
): asserts value is AnyTypeDescriptor {
  if (isTypeDescriptor(value)) return;
  const received = isFieldDescriptor(value)
    ? `field use (${value.kind})`
    : isScalarFactory(value)
      ? "scalar factory"
      : value === null
        ? "null"
        : typeof value;
  failDefinition({
    code,
    path,
    message:
      "Expected a named type created by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
    expected: "a named type descriptor",
    received,
    repair,
  });
}

function stringOption(
  options: { readonly [key: string]: DataValue },
  key: "description" | "deprecated",
  path: DataPath,
): string | null {
  if (!Object.hasOwn(options, key)) return null;
  const value = options[key];
  if (typeof value !== "string") {
    return failDefinition({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, key],
      message: `Option ${key} must be a string.`,
      expected: "string",
      received: typeof value,
      repair: `Pass a string ${key} or omit it.`,
    });
  }
  return value;
}

function defaultOption(
  options: { readonly [key: string]: DataValue },
  path: DataPath,
): FieldDefault {
  if (!Object.hasOwn(options, "defaultValue")) return { present: false };
  const value = options.defaultValue;
  if (value === undefined) {
    return failDefinition({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "defaultValue"],
      message: "defaultValue is present but undefined.",
      expected: "a JSON value, or no defaultValue property at all",
      received: "undefined",
      repair:
        "Delete the defaultValue property to omit the default, or give it a JSON value such as null.",
    });
  }
  try {
    canonicalJson(value);
  } catch (error) {
    return failDefinition({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "defaultValue"],
      message: `defaultValue is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      repair: "Use a JSON value for defaultValue.",
    });
  }
  return { present: true, value: value as JsonValue };
}

export type ResolvedFieldOptions<TRequired extends boolean> = {
  readonly required: TRequired;
  readonly presentation: FieldPresentation;
};

export function resolveFieldOptions<TRequired extends boolean>(
  options: FieldOptions<TRequired> | undefined,
  path: DataPath,
): ResolvedFieldOptions<TRequired> {
  const config =
    options === undefined
      ? {}
      : snapshotDataOptions(
          options,
          FIELD_OPTION_KEYS,
          path,
          "PH-DEF-FIELD-OPTION-UNSUPPORTED",
        );
  const required = Object.hasOwn(config, "required") ? config.required : false;
  if (typeof required !== "boolean") {
    return failDefinition({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "required"],
      message: "Option required must be a boolean.",
      expected: "boolean",
      received: typeof required,
      repair: "Use required: true, required: false, or omit the option.",
    });
  }
  return {
    required: required as TRequired,
    presentation: Object.freeze({
      description: stringOption(config, "description", path),
      deprecated: stringOption(config, "deprecated", path),
      default: Object.freeze(defaultOption(config, path)),
    }),
  };
}

export function assertBareListItem(
  item: AnyFieldDescriptor,
  path: DataPath,
): void {
  const authored = LIST_ITEM_METADATA_KEYS.filter((key) =>
    key === "defaultValue"
      ? item.presentation.default.present
      : item.presentation[key as "description" | "deprecated"] !== null,
  );
  if (authored.length === 0) return;
  failDefinition({
    code: "PH-DEF-OPTION-INVALID",
    path: [...path, "options", authored[0]],
    message: `A list item carries ${authored.join(", ")}, but GraphQL has no field or argument definition for a list item.`,
    received: authored.join(", "),
    repair: `Move ${authored.join(", ")} to the ph.list(...) options of the outer field use.`,
  });
}

export function createScalarField<
  TBase,
  TRequired extends boolean,
  TInput = TBase,
>(
  scalarName: string,
  baseValidator: z.ZodType,
  options: FieldOptions<TRequired> | undefined,
  binding?: ScalarBinding,
): ScalarDescriptor<
  Nullable<TInput, TRequired>,
  Nullable<TBase, TRequired>,
  Nullable<TInput, TRequired>,
  TRequired
> {
  const { required, presentation } = resolveFieldOptions(options, ["options"]);
  const descriptor = {
    kind: "scalar" as const,
    role: FIELD_USE_ROLE,
    identity: Object.freeze({
      kind: "scalar" as const,
      name: scalarName,
      required,
    }),
    scalarName,
    baseValidator,
    ...(binding !== undefined && { binding }),
    required,
    presentation,
    validator: undefined as unknown as z.ZodType,
  };
  descriptor.validator = buildValidator(descriptor, "output");
  return registerFieldDescriptor(Object.freeze(descriptor));
}
