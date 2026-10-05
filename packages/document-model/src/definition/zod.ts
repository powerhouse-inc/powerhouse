import type { JsonValue } from "@powerhousedao/shared/document-model";
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
 * Generated state schemas wrap nullable fields with `.nullable()` and
 * generated input schemas with `.nullish()`. The position decides which one a
 * field use gets, so the same descriptor can validate in both.
 */
export type ValidatorPosition = "input" | "output";

const inputValidators = new WeakMap<object, z.ZodType>();

function withNullability(
  base: z.ZodType,
  required: boolean,
  position: ValidatorPosition,
): z.ZodType {
  if (required) return base;
  return position === "input" ? base.nullish() : base.nullable();
}

/**
 * Generated schemas list their members alphabetically, after an optional
 * `__typename` literal. Shape order carries no validation meaning, but Zod
 * reports issues in shape order and a failed operation persists that message,
 * so the compiled schemas keep the generated order.
 */
function objectShape(
  fields: ObjectFields,
  position: ValidatorPosition,
): Record<string, z.ZodType> {
  return Object.fromEntries(
    Object.entries(fields)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, field]) => [key, validatorFor(field, position)]),
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

/** Builds the validator a descriptor has in the given position. Not memoized. */
export function buildValidator(
  descriptor: AnyDescriptor,
  position: ValidatorPosition,
): z.ZodType {
  switch (descriptor.kind) {
    case "scalar": {
      const scalar = descriptor as ScalarDescriptor<any, any, any>;
      return withNullability(scalar.baseValidator, scalar.required, position);
    }
    case "list": {
      const list = descriptor as ListDescriptor<any, any, any>;
      return withNullability(
        z.array(validatorFor(list.item, position)),
        list.required,
        position,
      );
    }
    case "ref": {
      const reference = descriptor as ReferenceDescriptor<any, any, any>;
      return withNullability(
        z.lazy(() => validatorFor(resolveReference(reference), position)),
        reference.required,
        position,
      );
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
      const shape = objectShape(
        (descriptor as InputDescriptor).fields,
        "input",
      );
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
        ...objectShape(object.fields as ObjectFields, "output"),
      });
    }
    case "interface":
      return z.object(
        objectShape((descriptor as InterfaceDescriptor).fields, "output"),
      );
    case "union": {
      // Generated unions list their members alphabetically too.
      const members = [...(descriptor as UnionDescriptor).members]
        .sort((left, right) => compareCodeUnits(left.name, right.name))
        .map((member) => member.validator);
      return z.union(members as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    }
  }
}

/**
 * Returns the memoized validator for a descriptor in a position. A named type
 * has one natural position, so its own validator is returned as is; a field use
 * in input position is built once per descriptor token.
 */
export function validatorFor(
  descriptor: AnyDescriptor,
  position: ValidatorPosition,
): z.ZodType {
  if (position === "output" || !isFieldUse(descriptor)) {
    return descriptor.validator;
  }
  const memoized = inputValidators.get(descriptor);
  if (memoized !== undefined) return memoized;
  const built = buildValidator(descriptor, position);
  inputValidators.set(descriptor, built);
  return built;
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
    validatorFor(root, "output").parse(parsed);
  } catch (error) {
    return {
      ok: false,
      reason: "rejected",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return { ok: true, value: parsed, serialized };
}

function isFieldUse(
  descriptor: AnyDescriptor,
): descriptor is AnyFieldDescriptor {
  return (
    descriptor.kind === "scalar" ||
    descriptor.kind === "list" ||
    descriptor.kind === "ref"
  );
}
