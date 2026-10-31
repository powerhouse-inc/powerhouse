import type { DirectiveUseDefinition } from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { equalsPattern } from "../kernel/equals-pattern.js";
import { referenceResolver } from "./descriptor-registry.js";
import {
  compareGeneratedOrder,
  EMPTY_INPUT_FIELD_NAME,
} from "../kernel/primitives.js";
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
 * `.nullish()`, a nullable list item that is itself a list with `.nullish()`,
 * and any other nullable list item with `.nullable()`. So the slot a field use
 * fills decides, and a descriptor's own validator is its field-slot validator.
 */
function itemValidator(item: AnyFieldDescriptor): z.ZodType {
  const base = fieldBase(item);
  if (item.required) return base;
  return item.kind === "list" ? base.nullish() : base.nullable();
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

export function constrainedBase(field: AnyFieldDescriptor): z.ZodType {
  return field.presentation.directives.reduce(applyDirective, fieldBase(field));
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
 * Generated schemas list their members in `lexicographicSortSchema` order,
 * after an optional `__typename` literal. Shape order carries no validation meaning, but Zod
 * reports issues in shape order and a failed operation persists that message,
 * so the compiled schemas keep the generated order.
 */
function objectShape(fields: ObjectFields): Record<string, z.ZodType> {
  return Object.fromEntries(
    Object.entries(fields)
      .sort(([left], [right]) => compareGeneratedOrder(left, right))
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
      const base = withDefault(field, constrainedBase(field));
      return field.required ? base : base.nullish();
    }
    case "enum": {
      // Generated enums are sorted the same way, and the rejection message
      // lists the options in that order.
      const names = (descriptor as EnumDescriptor).values
        .map((value) => value.name)
        .sort(compareGeneratedOrder);
      return z.enum(names as [string, ...string[]]);
    }
    case "input": {
      const shape = objectShape((descriptor as InputDescriptor).fields);
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
        ...objectShape(object.fields),
      });
    }
    case "interface":
      return z.object(objectShape((descriptor as InterfaceDescriptor).fields));
    case "union": {
      const members = [...(descriptor as UnionDescriptor).members]
        .sort((left, right) => compareGeneratedOrder(left.name, right.name))
        .map((member) => member.validator);
      return z.union(members as [z.ZodType, z.ZodType, ...z.ZodType[]]);
    }
  }
}
