import type { JsonValue } from "@powerhousedao/shared/document-model";
import { canonicalJson, EMPTY_INPUT_FIELD_NAME } from "../kernel/primitives.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  EnumDescriptor,
  InputDescriptor,
  ListDescriptor,
  ReferenceDescriptor,
  ScalarDescriptor,
} from "../dsl/types.js";
import { constrainedBase, resolveReference } from "../dsl/zod.js";

const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;
const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function fieldDefault(field: AnyFieldDescriptor): JsonValue | undefined {
  return field.presentation.default.present
    ? field.presentation.default.value
    : undefined;
}

function isIntLiteral(value: JsonValue): value is number {
  return typeof value === "number" && /^-?\d+$/.test(JSON.stringify(value));
}

/** `Array.isArray` narrows a readonly JSON array to `any[]`. */
function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isInputObject(
  value: JsonValue,
): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function builtInLiteral(
  name: string,
  value: JsonValue,
): { readonly accepted: unknown } | { readonly rejected: string } | undefined {
  const shown = canonicalJson(value);
  switch (name) {
    case "Int":
      return isIntLiteral(value) && value >= INT_MIN && value <= INT_MAX
        ? { accepted: value }
        : { rejected: `${shown} is not a signed 32-bit integer` };
    case "Float":
      return typeof value === "number"
        ? { accepted: value }
        : { rejected: `${shown} is not a number` };
    case "String":
      return typeof value === "string"
        ? { accepted: value }
        : { rejected: `${shown} is not a string` };
    case "Boolean":
      return typeof value === "boolean"
        ? { accepted: value }
        : { rejected: `${shown} is not a boolean` };
    case "ID":
      if (typeof value === "string") return { accepted: value };
      return isIntLiteral(value)
        ? { accepted: String(value) }
        : { rejected: `${shown} is not a string or an integer` };
    default:
      return undefined;
  }
}

function printableProblem(value: JsonValue): string | null {
  if (typeof value === "string") {
    return LONE_SURROGATE.test(value)
      ? `${canonicalJson(value)} is not well-formed Unicode`
      : null;
  }
  if (isList(value)) {
    for (const member of value) {
      const problem = printableProblem(member);
      if (problem !== null) return problem;
    }
    return null;
  }
  if (!isInputObject(value)) return null;
  for (const [key, member] of Object.entries(value)) {
    const problem = GRAPHQL_NAME.test(key)
      ? printableProblem(member)
      : `key ${JSON.stringify(key)} is not a GraphQL name`;
    if (problem !== null) return problem;
  }
  return null;
}

function scalarProblem(
  scalar: ScalarDescriptor<unknown, unknown>,
  value: JsonValue,
): string | null {
  const builtIn = builtInLiteral(scalar.scalarName, value);
  if (builtIn !== undefined && "rejected" in builtIn) return builtIn.rejected;
  const unprintable = printableProblem(value);
  if (unprintable !== null) return unprintable;
  const invalid = `${canonicalJson(value)} is not a valid ${scalar.scalarName}`;
  let result;
  try {
    result = constrainedBase(scalar).safeParse(
      builtIn === undefined ? value : builtIn.accepted,
    );
  } catch (error) {
    // A refinement can throw, and an async one throws on a synchronous parse.
    return `${invalid}: its validator threw (${thrownReason(error)})`;
  }
  if (result.success) return null;
  return `${invalid}: ${issueReason(result.error.issues)}`;
}

function issueReason(issues: readonly { readonly message: string }[]): string {
  return issues.map((issue) => issue.message.replace(/\.$/, "")).join("; ");
}

function thrownReason(error: unknown): string {
  const issues = (error as { issues?: unknown } | null)?.issues;
  const text = Array.isArray(issues)
    ? issueReason(issues as { message: string }[])
    : error instanceof Error
      ? error.message
      : String(error);
  return text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
}

function resolvedTarget(
  reference: ReferenceDescriptor<unknown, unknown>,
): AnyTypeDescriptor | undefined {
  try {
    return resolveReference(reference);
  } catch {
    return undefined;
  }
}

function enumProblem(target: EnumDescriptor, value: JsonValue): string | null {
  if (
    typeof value === "string" &&
    target.values.some((member) => member.name === value)
  ) {
    return null;
  }
  const members = target.values.map((member) => member.name).join(", ");
  return `${canonicalJson(value)} is not a value of enum ${target.name} (${members})`;
}

function inputObjectProblem(
  target: InputDescriptor,
  value: JsonValue,
): string | null {
  const name = target.name ?? "the input";
  if (!isInputObject(value)) {
    return `${canonicalJson(value)} is not an object for input ${name}`;
  }
  const declaresNoFields = Object.keys(target.fields).length === 0;
  for (const [key, member] of Object.entries(value)) {
    if (declaresNoFields && key === EMPTY_INPUT_FIELD_NAME) {
      if (member === null || typeof member === "boolean") continue;
      return `field ${JSON.stringify(key)}: ${canonicalJson(member)} is not a boolean`;
    }
    if (!Object.hasOwn(target.fields, key)) {
      return `field ${JSON.stringify(key)} is not declared on ${name}`;
    }
  }
  for (const [key, field] of Object.entries(target.fields)) {
    if (!Object.hasOwn(value, key)) {
      if (field.required && !field.presentation.default.present) {
        return `required field ${JSON.stringify(key)} of ${name} is missing`;
      }
      continue;
    }
    const problem = inputDefaultProblem(field, value[key]);
    if (problem !== null) return `field ${JSON.stringify(key)}: ${problem}`;
  }
  return null;
}

export function inputDefaultProblem(
  field: AnyFieldDescriptor,
  value: JsonValue,
): string | null {
  if (value === null) {
    return field.required ? "null is not accepted by a required field" : null;
  }
  switch (field.kind) {
    case "scalar":
      return scalarProblem(field as ScalarDescriptor<unknown, unknown>, value);
    case "list": {
      const { item } = field as ListDescriptor<unknown, unknown>;
      // GraphQL coerces a single value into a one-item list.
      if (!isList(value)) {
        return inputDefaultProblem(item, value);
      }
      for (const [index, member] of value.entries()) {
        const problem = inputDefaultProblem(item, member);
        if (problem !== null) return `item ${index}: ${problem}`;
      }
      return null;
    }
    case "ref": {
      const target = resolvedTarget(
        field as ReferenceDescriptor<unknown, unknown>,
      );
      switch (target?.kind) {
        case "enum":
          return enumProblem(target as EnumDescriptor, value);
        case "input":
          return inputObjectProblem(target as InputDescriptor, value);
        default:
          return null;
      }
    }
  }
}

function objectTargets(
  field: AnyFieldDescriptor,
  value: JsonValue | undefined,
): InputDescriptor[] {
  if (value === undefined || value === null) return [];
  if (field.kind === "list") {
    const { item } = field as ListDescriptor<unknown, unknown>;
    const members = isList(value) ? value : [value];
    return members.flatMap((member) => objectTargets(item, member));
  }
  if (field.kind !== "ref" || !isInputObject(value)) return [];
  const target = resolvedTarget(field as ReferenceDescriptor<unknown, unknown>);
  if (target?.kind !== "input") return [];
  const input = target as InputDescriptor;
  return [
    input,
    ...Object.entries(input.fields).flatMap(([key, nested]) =>
      Object.hasOwn(value, key) ? objectTargets(nested, value[key]) : [],
    ),
  ];
}

/**
 * graphql-js coerces an input field's default while it builds the fields of
 * the declaring type, and reads the fields of every input type the default
 * holds an object of. When those reads lead back to `owner`, the build never
 * ends. Returns the fields whose defaults close that loop, starting with
 * `owner.key`, or null when there is no loop.
 */
export function inputDefaultCycle(
  owner: InputDescriptor,
  key: string,
): readonly string[] | null {
  const seen = new Set<InputDescriptor>([owner]);
  const pending: { type: InputDescriptor; trail: readonly string[] }[] = [];
  const follow = (
    type: InputDescriptor,
    name: string,
    trail: readonly string[],
  ): readonly string[] | null => {
    const field = type.fields[name];
    const step = [...trail, `${type.name}.${name}`];
    for (const target of objectTargets(field, fieldDefault(field))) {
      if (target === owner) return step;
      if (seen.has(target)) continue;
      seen.add(target);
      pending.push({ type: target, trail: step });
    }
    return null;
  };
  const direct = follow(owner, key, []);
  if (direct !== null) return direct;
  for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
    for (const name of Object.keys(next.type.fields)) {
      const cycle = follow(next.type, name, next.trail);
      if (cycle !== null) return cycle;
    }
  }
  return null;
}
