import type {
  DirectiveUseDefinition,
  EnumTypeDefinition,
  FieldDefinition,
  InputFieldDefinition,
  JsonValue,
  NamedGraphQLTypeDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { EMPTY_INPUT_FIELD_NAME } from "./primitives.js";

const INDENT = "  ";
const LINE = "\n";

type NamedTypeInventory = ReadonlyMap<string, NamedGraphQLTypeDefinition>;

function namedTypeInventory(
  definitions: readonly NamedGraphQLTypeDefinition[],
): NamedTypeInventory {
  const inventory = new Map<string, NamedGraphQLTypeDefinition>();
  for (const definition of definitions) {
    inventory.set(definition.name, definition);
  }
  return inventory;
}

const ESCAPES: Readonly<Record<string, string | undefined>> = {
  '"': '\\"',
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

function isControlCodePoint(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

function stringLiteral(value: string): string {
  let printed = '"';
  for (const point of value) {
    const escape = ESCAPES[point];
    if (escape !== undefined) {
      printed += escape;
      continue;
    }
    const code = point.codePointAt(0) ?? 0;
    printed += isControlCodePoint(code)
      ? `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`
      : point;
  }
  return `${printed}"`;
}

function hasControlCodePoint(value: string): boolean {
  for (const point of value) {
    if (isControlCodePoint(point.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

/**
 * A block string survives the lexer's dedent only when every line is nonempty
 * and carries no leading or trailing whitespace of its own, and the value ends
 * in neither a quote nor a backslash. Every other description prints as an
 * escaped single-line string, which always round-trips.
 */
function blockStringable(value: string): boolean {
  if (!value.includes(LINE)) return false;
  if (value.includes('"""')) return false;
  if (value.endsWith('"') || value.endsWith("\\")) return false;
  return value
    .split(LINE)
    .every(
      (line) =>
        line.length > 0 &&
        line.trim() === line &&
        !hasControlCodePoint(line) &&
        !line.includes("\r"),
    );
}

function descriptionLiteral(value: string, indent: string): string {
  if (!blockStringable(value)) return stringLiteral(value);
  const lines = value.split(LINE).map((line) => `${indent}${line}`);
  return ['"""', ...lines, `${indent}"""`].join(LINE);
}

function descriptionLine(
  description: string | null,
  indent: string = "",
): string {
  if (description === null) return "";
  return `${indent}${descriptionLiteral(description, indent)}${LINE}`;
}

function inlineDescription(description: string | null): string {
  return description === null ? "" : `${stringLiteral(description)} `;
}

function printNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `A GraphQL value must be finite, received ${String(value)}.`,
    );
  }
  return JSON.stringify(value);
}

function printGraphQLLiteral(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return printNumber(value);
  if (typeof value === "string") return stringLiteral(value);
  if (Array.isArray(value)) {
    return `[${value.map(printGraphQLLiteral).join(", ")}]`;
  }
  const entries = Object.entries(value).map(
    ([key, member]) => `${key}: ${printGraphQLLiteral(member)}`,
  );
  return `{${entries.join(", ")}}`;
}

function enumValueNames(definition: EnumTypeDefinition): ReadonlySet<string> {
  return new Set(definition.values.map((value) => value.name));
}

function printTypedValue(
  value: JsonValue,
  type: TypeReferenceDefinition,
  inventory: NamedTypeInventory,
): string {
  if (value === null) return "null";
  if (type.kind === "list") {
    // GraphQL coerces a single value into a one-item list, so a nonarray
    // default prints against the item type rather than failing here.
    if (!Array.isArray(value)) {
      return printTypedValue(value, type.item, inventory);
    }
    const items = (value as readonly JsonValue[]).map((item) =>
      printTypedValue(item, type.item, inventory),
    );
    return `[${items.join(", ")}]`;
  }
  if (type.kind === "scalar") return printGraphQLLiteral(value);
  const definition = inventory.get(type.name);
  if (definition === undefined) return printGraphQLLiteral(value);
  if (definition.kind === "enum") {
    return typeof value === "string" && enumValueNames(definition).has(value)
      ? value
      : printGraphQLLiteral(value);
  }
  if (
    definition.kind !== "input" ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return printGraphQLLiteral(value);
  }
  const fields = new Map(definition.fields.map((field) => [field.name, field]));
  const entries = Object.entries(value).map(([key, member]) => {
    const field = fields.get(key);
    const printed =
      field === undefined
        ? printGraphQLLiteral(member)
        : printTypedValue(member, field.type, inventory);
    return `${key}: ${printed}`;
  });
  return `{${entries.join(", ")}}`;
}

export function printTypeReference(type: TypeReferenceDefinition): string {
  const base =
    type.kind === "list" ? `[${printTypeReference(type.item)}]` : type.name;
  return type.required ? `${base}!` : base;
}

function printDeprecated(deprecated: string | null): string {
  return deprecated === null
    ? ""
    : ` @deprecated(reason: ${stringLiteral(deprecated)})`;
}

function printDirectives(
  directives: readonly DirectiveUseDefinition[] | undefined,
): string {
  if (directives === undefined || directives.length === 0) return "";
  return directives
    .map((directive) => {
      if (directive.arguments.length === 0) return ` @${directive.name}`;
      const args = directive.arguments
        .map(
          (argument) =>
            `${argument.name}: ${printGraphQLLiteral(argument.value)}`,
        )
        .join(", ");
      return ` @${directive.name}(${args})`;
    })
    .join("");
}

function printInputValue(
  field: InputFieldDefinition,
  inventory: NamedTypeInventory,
): string {
  const defaultValue = Object.hasOwn(field, "defaultValue")
    ? ` = ${printTypedValue(field.defaultValue as JsonValue, field.type, inventory)}`
    : "";
  return `${field.name}: ${printTypeReference(field.type)}${defaultValue}${printDeprecated(field.deprecated)}${printDirectives(field.directives)}`;
}

function printInputField(
  field: InputFieldDefinition,
  inventory: NamedTypeInventory,
): string {
  return `${descriptionLine(field.description, INDENT)}${INDENT}${printInputValue(field, inventory)}`;
}

function printArguments(
  args: readonly InputFieldDefinition[] | undefined,
  inventory: NamedTypeInventory,
): string {
  if (args === undefined || args.length === 0) return "";
  const printed = args
    .map(
      (argument) =>
        `${inlineDescription(argument.description)}${printInputValue(argument, inventory)}`,
    )
    .join(", ");
  return `(${printed})`;
}

function printField(
  field: FieldDefinition,
  inventory: NamedTypeInventory,
): string {
  return `${descriptionLine(field.description, INDENT)}${INDENT}${field.name}${printArguments(field.args, inventory)}: ${printTypeReference(field.type)}${printDeprecated(field.deprecated)}${printDirectives(field.directives)}`;
}

function printImplements(implemented: readonly string[] | undefined): string {
  return implemented === undefined || implemented.length === 0
    ? ""
    : ` implements ${implemented.join(" & ")}`;
}

function printBlock(members: readonly string[]): string {
  return members.length === 0 ? "" : ` {${LINE}${members.join(LINE)}${LINE}}`;
}

export function printNamedDefinition(
  definition: NamedGraphQLTypeDefinition,
  inventory: NamedTypeInventory = namedTypeInventory([definition]),
): string {
  const description = descriptionLine(definition.description);
  switch (definition.kind) {
    case "enum": {
      const values = definition.values.map(
        (value) =>
          `${descriptionLine(value.description, INDENT)}${INDENT}${value.name}${printDeprecated(value.deprecated)}${printDirectives(value.directives)}`,
      );
      return `${description}enum ${definition.name}${printBlock(values)}`;
    }
    case "object": {
      const fields = definition.fields.map((field) =>
        printField(field, inventory),
      );
      return `${description}type ${definition.name}${printImplements(definition.implements)}${printBlock(fields)}`;
    }
    case "interface": {
      const fields = definition.fields.map((field) =>
        printField(field, inventory),
      );
      return `${description}interface ${definition.name}${printImplements(definition.implements)}${printBlock(fields)}`;
    }
    case "input": {
      const fields =
        definition.fields.length === 0
          ? [`${INDENT}${EMPTY_INPUT_FIELD_NAME}: Boolean`]
          : definition.fields.map((field) => printInputField(field, inventory));
      return `${description}input ${definition.name}${printBlock(fields)}`;
    }
    case "union":
      return `${description}union ${definition.name} = ${definition.members.join(" | ")}`;
  }
}

export function printSchemaSegment(
  definitions: readonly NamedGraphQLTypeDefinition[],
  known: readonly NamedGraphQLTypeDefinition[] = definitions,
): string {
  if (definitions.length === 0) return "";
  const inventory = namedTypeInventory(known);
  return `${definitions
    .map((definition) => printNamedDefinition(definition, inventory))
    .join(`${LINE}${LINE}`)}${LINE}`;
}
