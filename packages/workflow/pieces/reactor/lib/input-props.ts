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
    default:
      return Property.Json(base);
  }
}

export function inputProps(schema: ActionInputSchema): DynamicPropsValue {
  const props: Record<string, unknown> = {};
  for (const field of schema.root) props[field.name] = propFor(field, schema);
  return props as DynamicPropsValue;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// Unset fields are left out; a value that won't convert is passed through
// for the model's own schema to reject by name.
export function coerceInput(
  schema: ActionInputSchema,
  raw: unknown,
): Record<string, unknown> {
  const values =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const input: Record<string, unknown> = {};
  for (const field of schema.root) {
    const value = values[field.name];
    if (value === undefined || value === null || value === "") continue;
    if (field.type.list) {
      input[field.name] = parseJson(value);
      continue;
    }
    const kind = fieldKind(field.type, schema);
    if (kind === "integer" || kind === "number") {
      const number = typeof value === "string" ? Number(value.trim()) : value;
      input[field.name] = Number.isFinite(number) ? number : value;
    } else if (kind === "boolean") {
      input[field.name] =
        value === "true" ? true : value === "false" ? false : value;
    } else if (kind === "object" || kind === "json") {
      input[field.name] = parseJson(value);
    } else {
      input[field.name] = value;
    }
  }
  return input;
}
