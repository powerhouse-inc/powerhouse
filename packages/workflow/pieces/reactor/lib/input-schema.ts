// An operation's input SDL as form fields: its root input, nested inputs and
// enums, read with graphql's own parser.
import {
  GraphQLError,
  Kind,
  parse,
  type InputObjectTypeDefinitionNode,
  type TypeNode,
} from "graphql";

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
  rootName: string;
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
  | "json"
  | "unsupported";

// Every scalar a document model can declare, by the value it carries.
const SCALAR_KINDS: Record<string, FieldKind> = {
  String: "text",
  ID: "text",
  OID: "text",
  PHID: "text",
  OLabel: "text",
  URL: "text",
  Date: "text",
  DateTime: "text",
  EmailAddress: "text",
  EthereumAddress: "text",
  Currency: "text",
  Address: "text",
  AttachmentRef: "text",
  Int: "integer",
  Float: "number",
  Amount_Money: "number",
  Amount_Percentage: "number",
  Amount_Tokens: "number",
  Boolean: "boolean",
  // {unit, value} objects.
  Amount: "object",
  Amount_Crypto: "object",
  Amount_Currency: "object",
  Amount_Fiat: "object",
  Unknown: "json",
};

export class SdlSyntaxError extends Error {
  constructor(message: string) {
    super(`Invalid input SDL: ${message}`);
    this.name = "SdlSyntaxError";
  }
}

function typeRef(node: TypeNode): TypeRef {
  if (node.kind === Kind.NON_NULL_TYPE) {
    return { ...typeRef(node.type), required: true };
  }
  if (node.kind === Kind.LIST_TYPE) {
    return { name: typeRef(node.type).name, list: true, required: false };
  }
  return { name: node.name.value, list: false, required: false };
}

function inputFields(node: InputObjectTypeDefinitionNode): InputField[] {
  return (node.fields ?? [])
    .filter((field) => field.name.value !== "_")
    .map((field) => {
      const description = field.description?.value.replace(/\s+/g, " ");
      return {
        name: field.name.value,
        type: typeRef(field.type),
        ...(description ? { description } : {}),
      };
    });
}

export interface SdlDefinitions {
  inputs: Map<string, InputField[]>;
  enums: Map<string, string[]>;
}

// Throws SdlSyntaxError on text that is not SDL.
export function parseSdl(sdl: string): SdlDefinitions {
  let document;
  try {
    document = parse(sdl, { noLocation: true });
  } catch (error) {
    throw new SdlSyntaxError(
      error instanceof GraphQLError ? error.message : String(error),
    );
  }
  const inputs = new Map<string, InputField[]>();
  const enums = new Map<string, string[]>();
  for (const definition of document.definitions) {
    if (definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) {
      inputs.set(definition.name.value, inputFields(definition));
    } else if (definition.kind === Kind.ENUM_TYPE_DEFINITION) {
      enums.set(
        definition.name.value,
        (definition.values ?? []).map((value) => value.name.value),
      );
    }
  }
  return { inputs, enums };
}

const bare = (name: string) => name.replace(/[^A-Za-z0-9]/g, "").toLowerCase();

// The input the operation's SDL defines for it, compared without case or
// separators: SET_URL finds SetUrlInput or SetURLInput. Ambiguous is none.
export function rootInputName(
  actionType: string,
  inputs: Iterable<string>,
): string | undefined {
  const wanted = `${bare(actionType)}input`;
  const matches = [...inputs].filter((name) => bare(name) === wanted);
  return matches.length === 1 ? matches[0] : undefined;
}

// Null when the SDL defines no input for the operation.
export function parseActionInputSchema(
  sdl: string,
  actionType: string,
): ActionInputSchema | null {
  const { inputs, enums } = parseSdl(sdl);
  const rootName = rootInputName(actionType, inputs.keys());
  const root = rootName ? inputs.get(rootName) : undefined;
  return rootName && root ? { rootName, root, inputs, enums } : null;
}

export function fieldKind(type: TypeRef, schema: ActionInputSchema): FieldKind {
  if (schema.inputs.has(type.name)) return "object";
  if (schema.enums.has(type.name)) return "enum";
  return SCALAR_KINDS[type.name] ?? "unsupported";
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
