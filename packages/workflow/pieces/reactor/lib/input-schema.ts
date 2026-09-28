// Reads an action's GraphQL input SDL into fields a form can render: the root
// `<ActionType>Input`, the input types it nests, and the enums it uses.

export interface TypeRef {
  name: string;
  list: boolean;
  required: boolean;
}

export interface InputField {
  name: string;
  type: TypeRef;
  description?: string;
}

export interface ActionInputSchema {
  root: InputField[];
  inputs: Map<string, InputField[]>;
  enums: Map<string, string[]>;
}

export type FieldKind =
  | "text"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "object"
  | "json";

const TEXT_SCALARS = new Set([
  "String",
  "ID",
  "OID",
  "PHID",
  "OLabel",
  "URL",
  "Date",
  "DateTime",
  "EmailAddress",
  "EthereumAddress",
  "Currency",
]);

export function rootInputName(actionType: string): string {
  const pascal = actionType
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
  return `${pascal}Input`;
}

function parseType(raw: string): TypeRef {
  const trimmed = raw.trim();
  const required = trimmed.endsWith("!");
  const bare = required ? trimmed.slice(0, -1) : trimmed;
  const list = bare.startsWith("[");
  const name = bare.replace(/[[\]!]/g, "").trim();
  return { name, list, required };
}

function parseFields(body: string): InputField[] {
  const fields: InputField[] = [];
  let description: string | undefined;
  // Block descriptions fold onto one line first, so none of their lines can
  // read as a field or open a line string.
  const lines = body
    .replace(
      /"""([\s\S]*?)"""/g,
      (_, text: string) => `"${text.trim().replace(/\s+/g, " ")}"`,
    )
    .split("\n");
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const doc = /^"(.*)"$/.exec(line);
    if (doc) {
      description = doc[1].replace(/\s+/g, " ");
      continue;
    }
    const match = /^(\w+)\s*:\s*([\w[\]!\s]+?)(?:\s*=.*)?$/.exec(line);
    if (!match) continue;
    const [, name, type] = match;
    // The generator's stand-in for an input with no fields.
    if (name !== "_") {
      fields.push({
        name,
        type: parseType(type),
        ...(description ? { description } : {}),
      });
    }
    description = undefined;
  }
  return fields;
}

// Null when the SDL has no `<ActionType>Input`, so the caller falls back to JSON.
export function parseActionInputSchema(
  sdl: string,
  actionType: string,
): ActionInputSchema | null {
  const inputs = new Map<string, InputField[]>();
  const enums = new Map<string, string[]>();
  for (const match of sdl.matchAll(/\b(input|enum)\s+(\w+)\s*\{([^}]*)\}/g)) {
    const [, keyword, name, body] = match;
    if (keyword === "input") inputs.set(name, parseFields(body));
    else {
      enums.set(
        name,
        body
          .replace(/#.*$/gm, "")
          .replace(/"[^"]*"/g, "")
          .split(/[\s,]+/)
          .filter(Boolean),
      );
    }
  }
  const root = inputs.get(rootInputName(actionType));
  return root ? { root, inputs, enums } : null;
}

export function fieldKind(type: TypeRef, schema: ActionInputSchema): FieldKind {
  if (schema.inputs.has(type.name)) return "object";
  if (schema.enums.has(type.name)) return "enum";
  if (type.name === "Boolean") return "boolean";
  if (type.name === "Int") return "integer";
  if (type.name === "Float") return "number";
  if (TEXT_SCALARS.has(type.name)) return "text";
  return "json";
}

// A starting value: required fields get an empty value of their kind, and
// optional ones are left out rather than sent as null.
export function templateFor(
  fields: InputField[],
  schema: ActionInputSchema,
  depth = 0,
): Record<string, unknown> {
  const template: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.type.required) continue;
    if (field.type.list) {
      template[field.name] = [];
      continue;
    }
    const kind = fieldKind(field.type, schema);
    const nested = schema.inputs.get(field.type.name);
    // Self-referencing inputs stop here rather than recurse forever.
    if (kind === "object" && nested && depth < 4) {
      template[field.name] = templateFor(nested, schema, depth + 1);
    } else if (kind === "text") template[field.name] = "";
    else if (kind === "integer" || kind === "number") template[field.name] = 0;
    else if (kind === "boolean") template[field.name] = false;
    else if (kind === "enum") {
      template[field.name] = schema.enums.get(field.type.name)?.[0] ?? "";
    }
  }
  return template;
}

// "createdAt" → "Created at", for labels.
export function humanize(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
