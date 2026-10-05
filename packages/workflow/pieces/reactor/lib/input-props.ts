// An action's input as the props any Activepieces host renders, and the values
// those props produce turned back into the types the action's schema declares.
import {
  Property,
  type DynamicPropsValue,
} from "@powerhousedao/pieces-framework";
import {
  fieldKind,
  humanize,
  type ActionInputSchema,
  type FieldKind,
  type InputField,
} from "./input-schema.js";

// DynamicProperties allows text, static dropdowns and JSON only, so numbers
// are text and booleans a yes/no dropdown; coerceInput restores their types.
function propFor(field: InputField, schema: ActionInputSchema) {
  const base = {
    displayName: humanize(field.name),
    required: field.type.required,
    ...(field.description ? { description: field.description } : {}),
  };
  if (field.type.list) {
    return Property.Json({
      ...base,
      description: field.description ?? "A JSON list",
    });
  }
  switch (fieldKind(field.type, schema)) {
    case "text":
      return Property.ShortText(base);
    case "integer":
    case "number":
      return Property.ShortText({
        ...base,
        description: field.description ?? "A number",
      });
    case "boolean":
      return Property.StaticDropdown({
        ...base,
        options: {
          options: [
            { label: "Yes", value: true },
            { label: "No", value: false },
          ],
        },
      });
    case "enum":
      return Property.StaticDropdown({
        ...base,
        options: {
          options: (schema.enums.get(field.type.name) ?? []).map((value) => ({
            label: humanize(value),
            value,
          })),
        },
      });
    case "unsupported":
      return Property.Json({
        ...base,
        description: `Type ${field.type.name} is not supported by this form`,
      });
    default:
      return Property.Json(base);
  }
}

export function inputProps(schema: ActionInputSchema): DynamicPropsValue {
  const props: Record<string, unknown> = {};
  for (const field of schema.root) props[field.name] = propFor(field, schema);
  return props as DynamicPropsValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// JSON's number grammar, so "", "0x10" and "1e" are not numbers.
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function coerceField(
  field: InputField,
  kind: FieldKind,
  value: unknown,
): unknown {
  const fail = (expected: string) =>
    new Error(
      `input "${field.name}" (${field.type.name}) expects ${expected}; got ${preview(value)}`,
    );
  if (field.type.list) {
    if (!Array.isArray(value)) throw fail("a list");
    return value;
  }
  switch (kind) {
    case "text":
    case "enum":
      if (typeof value !== "string") throw fail("text");
      return value;
    case "integer":
    case "number": {
      const number =
        typeof value === "number"
          ? value
          : typeof value === "string" && NUMBER.test(value.trim())
            ? Number(value.trim())
            : Number.NaN;
      if (!Number.isFinite(number)) throw fail("a number");
      if (kind === "integer" && !Number.isInteger(number)) {
        throw fail("an integer");
      }
      return number;
    }
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "false") return value === "true";
      throw fail("true or false");
    case "object":
      if (!isRecord(value)) throw fail("an object");
      return value;
    case "json":
      return value;
    case "unsupported":
      throw new Error(
        `input "${field.name}" has type ${field.type.name}, which this piece cannot map`,
      );
  }
}

// Unset fields are left out; a value of the wrong shape is an error naming
// the field, never a guess at what was meant.
export function coerceInput(
  schema: ActionInputSchema,
  raw: unknown,
): Record<string, unknown> {
  const values = raw ?? {};
  if (!isRecord(values)) {
    throw new Error(`"input" must be an object; got ${preview(values)}`);
  }
  const input: Record<string, unknown> = {};
  for (const field of schema.root) {
    const value = values[field.name];
    if (value === undefined || value === null || value === "") continue;
    input[field.name] = coerceField(
      field,
      fieldKind(field.type, schema),
      value,
    );
  }
  return input;
}
