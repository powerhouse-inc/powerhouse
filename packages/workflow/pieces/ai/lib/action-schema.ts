// One structured-output schema for a model's actions, built from each
// operation's input SDL: { reason, actions: [{ type, input }] }.
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  actionOperations,
  ANY_SCOPE,
  operationSchemaSlice,
  stateSchemaSlice,
  type ModelOperation,
} from "@powerhousedao/reactor-mcp/tools";
import type { JSONSchema7 } from "ai";
import {
  fieldKind,
  parseActionInputSchema,
  type ActionInputSchema,
  type InputField,
} from "../../reactor/lib/input-schema.js";
import { withReferencedEnums } from "../../reactor/lib/schema-text.js";

export interface ActionsSchema {
  schema: JSONSchema7;
  operations: ModelOperation[];
  // False when some input is open (JSON scalars, recursion, unparsed SDL).
  strict: boolean;
}

const SCALAR_TYPES = {
  text: "string",
  integer: "integer",
  number: "number",
  boolean: "boolean",
} as const;

const OPEN_INPUT: JSONSchema7 = { type: "object" };

class Builder {
  strict = true;

  constructor(private readonly schema: ActionInputSchema) {}

  object(fields: InputField[], path: string[]): JSONSchema7 {
    const properties = Object.fromEntries(
      fields.map((field) => [field.name, this.field(field, path)]),
    );
    return {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    };
  }

  // Strict output lists every property; optional ones may be null.
  private field(field: InputField, path: string[]): JSONSchema7 {
    let value = this.value(field.type.name, path);
    if (field.type.list) value = { type: "array", items: value };
    if (field.description) value = { ...value, description: field.description };
    return field.type.required ? value : { anyOf: [value, { type: "null" }] };
  }

  private value(typeName: string, path: string[]): JSONSchema7 {
    const kind = fieldKind(
      { name: typeName, list: false, required: true },
      this.schema,
    );
    const nested = this.schema.inputs.get(typeName);
    if (nested) {
      if (path.includes(typeName)) return this.open();
      return this.object(nested, [...path, typeName]);
    }
    if (kind === "enum") {
      return { type: "string", enum: this.schema.enums.get(typeName) ?? [] };
    }
    if (kind in SCALAR_TYPES) {
      return { type: SCALAR_TYPES[kind as keyof typeof SCALAR_TYPES] };
    }
    return this.open();
  }

  private open(): JSONSchema7 {
    this.strict = false;
    return {};
  }
}

// The operation's input; an SDL without a root input reads as open.
function inputSchema(
  operation: ModelOperation,
  stateSchema: string,
): { schema: JSONSchema7; strict: boolean } {
  if (!operation.schema) {
    return {
      schema: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
      strict: true,
    };
  }
  let parsed: ActionInputSchema | null;
  try {
    parsed = parseActionInputSchema(
      withReferencedEnums(operation.schema, stateSchema),
      operation.name,
    );
  } catch {
    parsed = null;
  }
  if (!parsed) return { schema: OPEN_INPUT, strict: false };
  const builder = new Builder(parsed);
  const schema = builder.object(parsed.root, [parsed.rootName]);
  return { schema, strict: builder.strict };
}

// The operations a step may propose: the allowed ones, else all but UNDO, REDO and NOOP.
export function allowedOperations(
  module: DocumentModelModule,
  allowed: readonly string[],
): ModelOperation[] {
  if (allowed.length === 0) {
    return actionOperations(module).filter((o) => o.scope !== ANY_SCOPE);
  }
  // Unknown names fail with did-you-mean.
  return [...new Set(allowed)].map((name) =>
    operationSchemaSlice(module, name),
  );
}

export function buildActionsSchema(
  module: DocumentModelModule,
  operations: readonly ModelOperation[],
): ActionsSchema {
  const stateSchema = ["global", "local"]
    .map((scope) => stateSchemaSlice(module, scope as "global" | "local"))
    .map((slice) => slice.schema)
    .join("\n\n");
  let strict = true;
  const branches = operations.map((operation): JSONSchema7 => {
    const input = inputSchema(operation, stateSchema);
    strict &&= input.strict;
    return {
      type: "object",
      ...(operation.description ? { description: operation.description } : {}),
      properties: {
        type: { type: "string", enum: [operation.name] },
        input: input.schema,
      },
      required: ["type", "input"],
      additionalProperties: false,
    };
  });
  const items: JSONSchema7 =
    branches.length === 1 ? branches[0] : { anyOf: branches };
  return {
    schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Why these actions carry out the instruction, or why none do.",
        },
        actions: {
          type: "array",
          description: "Actions in the order to apply them; empty for none.",
          items,
        },
      },
      required: ["reason", "actions"],
      additionalProperties: false,
    },
    operations: [...operations],
    strict,
  };
}
