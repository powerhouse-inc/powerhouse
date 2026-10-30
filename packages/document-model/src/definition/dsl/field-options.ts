import { type DslDiagnosticCode, dslDiagnostics } from "./diagnostic-codes.js";
import type {
  DefinitionPath,
  DirectiveUseDefinition,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import type { ScalarDefinition } from "../../scalars/types.js";
import {
  type DataSnapshotRejection,
  type DataValue,
  rejectionReceived,
  snapshotArray,
  snapshotDataRecord,
  snapshotRecord,
} from "../kernel/data-properties.js";
import {
  isFieldDescriptor,
  isScalarFactory,
  isTypeDescriptor,
  registerFieldDescriptor,
} from "./descriptor-registry.js";
import { describeReceived } from "../kernel/diagnostics.js";
import { equalsPatternProblem } from "../kernel/equals-pattern.js";
import { canonicalJson, isAuthoredSchemaName } from "../kernel/primitives.js";
import {
  type AnyFieldDescriptor,
  type AnyTypeDescriptor,
  FIELD_USE_ROLE,
  type FieldDefault,
  type FieldPresentation,
  type Nullable,
  type ScalarDescriptor,
  type ScalarBuilderOptions,
} from "./types.js";
import { buildValidator } from "./zod.js";

const FIELD_OPTION_KEYS = Object.freeze([
  "required",
  "description",
  "deprecated",
  "defaultValue",
] as const);

const SCALAR_FIELD_OPTION_KEYS = Object.freeze([
  ...FIELD_OPTION_KEYS,
  "equals",
] as const);

const LIST_ITEM_METADATA_KEYS = ["description", "deprecated", "defaultValue"];

function rejectionPath(rejection: DataSnapshotRejection): DefinitionPath {
  return rejection.path.map((segment) =>
    typeof segment === "number" ? segment : String(segment),
  );
}

const FOREIGN_ARRAY =
  "Expected a plain array, not an Array subclass or an array from another realm.";

function optionRejection(
  rejection: DataSnapshotRejection,
  unsupportedKeyCode: DslDiagnosticCode,
  allowedKeys: readonly string[],
): never {
  if (rejection.reason === "unknown-key") {
    return dslDiagnostics.fail({
      code: unsupportedKeyCode,
      path: rejectionPath(rejection),
      message: `Option ${JSON.stringify(rejection.key)} is not supported here.`,
      expected: allowedKeys.join(", "),
      received: rejection.key,
      repair: `Remove ${JSON.stringify(rejection.key)}; the supported options are ${allowedKeys.join(", ")}.`,
    });
  }
  if (
    rejection.reason === "custom-prototype" &&
    rejection.expected === "array"
  ) {
    return dslDiagnostics.fail({
      code: "PH-DEF-OPTION-INVALID",
      path: rejectionPath(rejection),
      message: FOREIGN_ARRAY,
      received: rejection.received,
      repair: "Pass an array literal, or copy the array with Array.from(...).",
    });
  }
  return dslDiagnostics.fail({
    code: "PH-DEF-OPTION-INVALID",
    path: rejectionPath(rejection),
    message: `The option value could not be snapshotted (${rejection.reason}).`,
    received: rejectionReceived(rejection),
    repair:
      "Pass a plain object literal with enumerable string-keyed data properties and no accessors, symbols, or class instances.",
  });
}

export function snapshotDataOptions(
  value: unknown,
  allowedKeys: readonly string[],
  path: DefinitionPath,
  unsupportedKeyCode: DslDiagnosticCode = "PH-DEF-OPTION-INVALID",
): { readonly [key: string]: DataValue } {
  const snapshot = snapshotDataRecord(value, allowedKeys, path);
  if (!snapshot.ok)
    return optionRejection(snapshot, unsupportedKeyCode, allowedKeys);
  return snapshot.value;
}

export function snapshotDescriptorOptions(
  value: unknown,
  allowedKeys: readonly string[],
  path: DefinitionPath,
): { readonly [key: string]: unknown } {
  const snapshot = snapshotRecord(value, allowedKeys, path);
  if (!snapshot.ok)
    return optionRejection(snapshot, "PH-DEF-OPTION-INVALID", allowedKeys);
  return snapshot.value;
}

export function snapshotDescriptorArray(
  value: unknown,
  path: DefinitionPath,
  code: DslDiagnosticCode,
  repair: string,
): readonly unknown[] {
  const snapshot = snapshotArray(value, path);
  if (snapshot.ok) return snapshot.value;
  if (snapshot.reason === "not-array") {
    return dslDiagnostics.fail({
      code,
      path,
      message: "Expected an array.",
      received: snapshot.received,
      repair,
    });
  }
  if (snapshot.reason === "custom-prototype" && snapshot.expected === "array") {
    return dslDiagnostics.fail({
      code,
      path,
      message: FOREIGN_ARRAY,
      received: snapshot.received,
      repair: `${repair} Copy an Array subclass or an array from another realm with Array.from(...).`,
    });
  }
  return optionRejection(snapshot, code, []);
}

export function snapshotFieldMap(
  value: unknown,
  path: DefinitionPath,
): { readonly [key: string]: unknown } {
  const snapshot = snapshotRecord(value, undefined, path);
  if (!snapshot.ok)
    return optionRejection(snapshot, "PH-DEF-OPTION-INVALID", []);
  return snapshot.value;
}

export function assertAuthoredName(
  value: unknown,
  path: DefinitionPath,
): string {
  if (!isAuthoredSchemaName(value)) {
    return dslDiagnostics.fail({
      code: "PH-DEF-NAME-INVALID",
      path,
      message:
        "A GraphQL name must match /^[_A-Za-z][_0-9A-Za-z]*$/ and must not start with two underscores.",
      expected: "a GraphQL name such as InvoiceLineItem",
      received: typeof value === "string" ? value : describeReceived(value),
      repair:
        "Use letters, digits, and underscores, start with a letter or one underscore, and avoid the reserved __ prefix.",
    });
  }
  return value;
}

export function assertFieldUse(
  value: unknown,
  path: DefinitionPath,
): asserts value is AnyFieldDescriptor {
  if (isFieldDescriptor(value)) return;
  if (isScalarFactory(value)) {
    const role = (value as { readonly role: string }).role;
    dslDiagnostics.fail({
      code: "PH-SCALAR-FACTORY-AS-FIELD",
      path,
      message: "A scalar factory was used as a field without being called.",
      expected: FIELD_USE_ROLE,
      received: role,
      repair: role.slice(role.indexOf("call it, as ") + "call it, as ".length),
    });
  }
  if (isTypeDescriptor(value)) {
    dslDiagnostics.fail({
      code: "PH-DEF-TYPE-AS-FIELD",
      path,
      message: `Named type ${JSON.stringify(value.name)} was used directly as a field.`,
      expected: FIELD_USE_ROLE,
      received: value.role,
      repair: `Wrap the type with ph.ref(${value.name ?? "Type"}).`,
    });
  }
  dslDiagnostics.fail({
    code: "PH-DEF-FIELD-INVALID",
    path,
    message: "A field position must hold a field use created by ph.",
    received: describeReceived(value),
    repair:
      "Use a called scalar factory such as ph.String(), ph.list(...), or ph.ref(Type).",
  });
}

export function assertNamedType(
  value: unknown,
  path: DefinitionPath,
  code: DslDiagnosticCode,
  repair: string,
): asserts value is AnyTypeDescriptor {
  if (isTypeDescriptor(value)) return;
  const received = isFieldDescriptor(value)
    ? `field use (${value.kind})`
    : isScalarFactory(value)
      ? "scalar factory"
      : describeReceived(value);
  dslDiagnostics.fail({
    code,
    path,
    message:
      "Expected a named type created by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
    expected: "a named type descriptor",
    received,
    repair,
  });
}

export function stringOption(
  options: { readonly [key: string]: unknown },
  key: string,
  path: DefinitionPath,
): string | null {
  const value = options[key];
  if (value === undefined) return null;
  if (typeof value !== "string") {
    return dslDiagnostics.fail({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, key],
      message: `Option ${key} must be a string.`,
      expected: "string",
      received: describeReceived(value),
      repair: `Pass a string ${key} or omit it.`,
    });
  }
  return value;
}

function defaultOption(
  options: { readonly [key: string]: DataValue },
  path: DefinitionPath,
): FieldDefault {
  if (!Object.hasOwn(options, "defaultValue")) return { present: false };
  const value = options.defaultValue;
  if (value === undefined) {
    return dslDiagnostics.fail({
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
    return dslDiagnostics.fail({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "defaultValue"],
      message: `defaultValue is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      repair: "Use a JSON value for defaultValue.",
    });
  }
  return { present: true, value: value as JsonValue };
}

type ResolvedFieldOptions<TRequired extends boolean> = {
  readonly required: TRequired;
  readonly presentation: FieldPresentation;
};

const NO_DIRECTIVES: readonly DirectiveUseDefinition[] = Object.freeze([]);

function equalsDirectives(
  options: { readonly [key: string]: DataValue },
  path: DefinitionPath,
): readonly DirectiveUseDefinition[] {
  const value = stringOption(options, "equals", path);
  if (value === null) return NO_DIRECTIVES;
  const problem = equalsPatternProblem(value);
  if (problem !== undefined) {
    return dslDiagnostics.fail({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "equals"],
      received: value,
      ...problem,
    });
  }
  return Object.freeze([
    Object.freeze({
      name: "equals",
      arguments: Object.freeze([Object.freeze({ name: "value", value })]),
    }),
  ]);
}

export function resolveFieldOptions<TRequired extends boolean>(
  options: ScalarBuilderOptions<TRequired> | undefined,
  path: DefinitionPath,
  allowedKeys: readonly string[] = FIELD_OPTION_KEYS,
): ResolvedFieldOptions<TRequired> {
  const config =
    options === undefined
      ? {}
      : snapshotDataOptions(
          options,
          allowedKeys,
          path,
          "PH-DEF-FIELD-OPTION-UNSUPPORTED",
        );
  const required = config.required === undefined ? false : config.required;
  if (typeof required !== "boolean") {
    return dslDiagnostics.fail({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "required"],
      message: "Option required must be a boolean.",
      expected: "boolean",
      received: describeReceived(required),
      repair: "Use required: true, required: false, or omit the option.",
    });
  }
  return {
    required: required as TRequired,
    presentation: Object.freeze({
      description: stringOption(config, "description", path),
      deprecated: stringOption(config, "deprecated", path),
      default: Object.freeze(defaultOption(config, path)),
      directives: equalsDirectives(config, path),
    }),
  };
}

export function assertBareListItem(
  item: AnyFieldDescriptor,
  path: DefinitionPath,
): void {
  const authored = LIST_ITEM_METADATA_KEYS.filter((key) =>
    key === "defaultValue"
      ? item.presentation.default.present
      : item.presentation[key as "description" | "deprecated"] !== null,
  );
  if (authored.length > 0) {
    dslDiagnostics.fail({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "options", authored[0]],
      message: `A list item carries ${authored.join(", ")}, but GraphQL has no field or argument definition for a list item.`,
      received: authored.join(", "),
      repair: `Move ${authored.join(", ")} to the ph.list(...) options of the outer field use.`,
    });
  }
  if (item.presentation.directives.length > 0) {
    dslDiagnostics.fail({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "options", "equals"],
      message:
        "A list item carries equals, but GraphQL has no field or argument definition for a list item to carry @equals on.",
      received: "equals",
      repair:
        "Remove equals from the list item; a list cannot constrain its items with @equals.",
    });
  }
}

export function createScalarField<
  TBase,
  TRequired extends boolean,
  TDefaulted extends boolean,
  TInput = TBase,
>(
  scalarName: string,
  baseValidator: z.ZodType,
  options: ScalarBuilderOptions<TRequired> | undefined,
  definition?: ScalarDefinition,
): ScalarDescriptor<
  Nullable<TInput, TRequired>,
  Nullable<TBase, TRequired>,
  Nullable<TInput, TRequired>,
  TRequired,
  TDefaulted
> {
  const { required, presentation } = resolveFieldOptions(
    options,
    ["options"],
    SCALAR_FIELD_OPTION_KEYS,
  );
  // The generator appends `.regex(...)` to the scalar's own Zod schema, which
  // only a string schema has; on any other it emits code that throws.
  const carriesPattern =
    typeof (baseValidator as { readonly regex?: unknown }).regex === "function";
  if (presentation.directives.length > 0 && !carriesPattern) {
    dslDiagnostics.fail({
      code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
      path: ["options", "equals"],
      message: `Option equals adds a pattern check, and the validator of ${scalarName} is not a Zod string schema that can carry one.`,
      received: scalarName,
      repair:
        "Remove equals, or use it on a scalar whose validator is a Zod string schema, such as ph.String() or ph.PHID().",
    });
  }
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
    ...(definition !== undefined && { definition }),
    required,
    presentation,
    validator: undefined as unknown as z.ZodType,
  };
  descriptor.validator = buildValidator(descriptor);
  return registerFieldDescriptor(
    Object.freeze(descriptor) as unknown as ScalarDescriptor<
      Nullable<TInput, TRequired>,
      Nullable<TBase, TRequired>,
      Nullable<TInput, TRequired>,
      TRequired,
      TDefaulted
    >,
  );
}
