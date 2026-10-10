import type {
  DirectiveUseDefinition,
  JsonValue,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { referenceResolver } from "./descriptor-registry.js";
import { compareCodeUnits, EMPTY_INPUT_FIELD_NAME } from "./primitives.js";
import type {
  AnyDescriptor,
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  EnumDescriptor,
  InputDescriptor,
  InterfaceDescriptor,
  ListDescriptor,
  ObjectDescriptor,
  ObjectFields,
  ReferenceDescriptor,
  ScalarDescriptor,
  UnionDescriptor,
} from "./types.js";

/**
 * The generator wraps a nullable field of an object or an input with
 * `.nullish()`, and a nullable list item with `.nullable()`, whatever the
 * position. So the slot a field use fills decides, and a descriptor's own
 * validator is its field-slot validator.
 */
function itemValidator(item: AnyFieldDescriptor): z.ZodType {
  const base = fieldBase(item);
  return item.required ? base : base.nullable();
}

function fieldBase(field: AnyFieldDescriptor): z.ZodType {
  switch (field.kind) {
    case "scalar":
      return (field as ScalarDescriptor<any, any, any>).baseValidator;
    case "list":
      return z.array(
        itemValidator((field as ListDescriptor<any, any, any>).item),
      );
    case "ref": {
      const reference = field as ReferenceDescriptor<any, any, any>;
      return z.lazy(() => resolveReference(reference).validator);
    }
  }
}

/**
 * The regular expression source the generator writes for `@equals(value: v)`.
 * The plugin fills its template `/^$1$/` with `String.prototype.replace`, so
 * `v` is inserted unescaped and its replacement tokens (`$&`, `` $` ``, `$'`,
 * `$$`) are expanded first.
 */
export function equalsPattern(value: string): string {
  return "/^$1$/".replace("$1", value).slice(1, -1);
}

/**
 * The generator maps `@equals(value: v)` to `.regex(/^v$/)` and ignores every
 * other directive.
 */
function applyDirective(
  base: z.ZodType,
  directive: DirectiveUseDefinition,
): z.ZodType {
  const value = directive.arguments.find(
    (argument) => argument.name === "value",
  )?.value;
  if (directive.name !== "equals" || typeof value !== "string") return base;
  return base.check(z.regex(new RegExp(equalsPattern(value))));
}

/**
 * The generator emits `.default(v)` only on a field that is not a list and
 * whose default is a string, number, boolean, or enum literal. A list, input
 * object, or `null` default leaves the field as required as it was, although
 * the generated types make every defaulted field an optional key.
 */
function withDefault(field: AnyFieldDescriptor, base: z.ZodType): z.ZodType {
  const fallback = field.presentation.default;
  if (!fallback.present || field.kind === "list") return base;
  const { value } = fallback;
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? base.default(value as never)
    : base;
}

/**
 * Generated schemas list their members alphabetically, after an optional
 * `__typename` literal. Shape order carries no validation meaning, but Zod
 * reports issues in shape order and a failed operation persists that message,
 * so the compiled schemas keep the generated order.
 */
function objectShape(fields: ObjectFields): Record<string, z.ZodType> {
  return Object.fromEntries(
    Object.entries(fields)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, field]) => [key, field.validator]),
  );
}

export function resolveReference(
  descriptor: ReferenceDescriptor<any, any, any>,
): AnyTypeDescriptor {
  const resolve = referenceResolver(descriptor);
  if (resolve === undefined) {
    throw new TypeError("The reference descriptor was not created by ph.ref.");
  }
  return resolve();
}

export function buildValidator(descriptor: AnyDescriptor): z.ZodType {
  switch (descriptor.kind) {
    case "scalar":
    case "list":
    case "ref": {
      const field = descriptor as AnyFieldDescriptor;
      const base = withDefault(
        field,
        field.presentation.directives.reduce(applyDirective, fieldBase(field)),
      );
      return field.required ? base : base.nullish();
    }
    case "enum": {
      // Generated enums are alphabetical, and the rejection message lists the
      // options in that order.
      const names = (descriptor as EnumDescriptor).values
        .map((value) => value.name)
        .sort(compareCodeUnits);
      return z.enum(names as [string, ...string[]]);
    }
    case "input": {
      const shape = objectShape((descriptor as InputDescriptor).fields);
      // An explicit empty input projects `_empty: Boolean` in SDL, so its
      // generated validator carries the same optional member.
      return z.object(
        Object.keys(shape).length === 0
          ? { [EMPTY_INPUT_FIELD_NAME]: z.boolean().nullish() }
          : shape,
      );
    }
    case "object": {
      const object = descriptor as ObjectDescriptor;
      return z.object({
        __typename: z.literal(object.name).optional(),
        // Stored fields only: a computed member has no value in a document,
        // so there is nothing for a validator to check.
        ...objectShape(object.fields as ObjectFields),
      });
    }
    case "interface":
      return z.object(objectShape((descriptor as InterfaceDescriptor).fields));
    case "union": {
      // Generated unions list their members alphabetically too.
      const members = [...(descriptor as UnionDescriptor).members]
        .sort((left, right) => compareCodeUnits(left.name, right.name))
        .map((member) => member.validator);
      return z.union(members as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    }
  }
}

export type InitialValueResult =
  | {
      readonly ok: true;
      readonly value: JsonValue;
      readonly serialized: string;
    }
  | {
      readonly ok: false;
      readonly reason: "not-serializable" | "rejected";
      readonly message: string;
    };

/**
 * Materializes a declared initial state value the way the schema-first path
 * does: the platform's current `JSON.stringify`, then validation of the parsed
 * value with the state schema while Zod's returned copy is ignored. This keeps
 * the current handling of `undefined`, non-finite numbers, `toJSON`, and
 * enumerable properties, and adds no round-trip or prototype check.
 */
export function serializeAndValidateInitialValue(
  root: AnyTypeDescriptor,
  value: unknown,
): InitialValueResult {
  let serialized: string | undefined;
  try {
    // `JSON.stringify` returns undefined for undefined, a function, or a
    // symbol; the lib signature does not say so.
    serialized = JSON.stringify(value) as string | undefined;
  } catch (error) {
    return {
      ok: false,
      reason: "not-serializable",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  if (serialized === undefined) {
    return {
      ok: false,
      reason: "not-serializable",
      message: `JSON.stringify returned undefined for a value of type ${typeof value}`,
    };
  }
  const parsed = JSON.parse(serialized) as JsonValue;
  try {
    root.validator.parse(parsed);
  } catch (error) {
    return {
      ok: false,
      reason: "rejected",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return { ok: true, value: parsed, serialized };
}
