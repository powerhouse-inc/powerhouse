import { createAction, Property } from "@powerhousedao/pieces-framework";
import { generateText, jsonSchema, Output, type JSONSchema7 } from "ai";
import { aiAuth, readConnection } from "../auth.js";
import {
  createLanguageModel,
  resolveModelId,
  schemaOptions,
  type ChatModel,
} from "../models.js";
import {
  maxOutputTokensProp,
  modelProp,
  positive,
  toText,
  toUsage,
} from "../props.js";

const FIELD_TYPES = ["string", "number", "boolean"] as const;
type FieldType = (typeof FIELD_TYPES)[number];
type Mode = "simple" | "advanced";

export interface ExtractSchema {
  schema: JSONSchema7;
  // Sanitized property name -> the field name the user typed.
  names: Record<string, string>;
  // Simple schemas meet strict structured-output rules; user schemas may not.
  strict: boolean;
}

const DEFAULT_PROMPT = "Extract the following data from the provided text.";

function simpleSchema(rows: unknown): ExtractSchema {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Add at least one field to extract.");
  }
  // Null-prototype maps, so names like "__proto__" stay plain keys.
  const properties = Object.create(null) as Record<string, JSONSchema7>;
  const names = Object.create(null) as Record<string, string>;
  rows.forEach((row: unknown, index) => {
    const fields =
      row !== null && typeof row === "object"
        ? (row as Record<string, unknown>)
        : {};
    const name = typeof fields.name === "string" ? fields.name.trim() : "";
    if (!name) throw new Error(`Field ${index + 1}: the name is required.`);
    const sanitized = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
    // The SDK's JSON parser refuses "__proto__"; `names` restores it.
    const key = sanitized === "__proto__" ? "_proto_" : sanitized;
    if (Object.hasOwn(names, key)) {
      throw new Error(`Field ${index + 1}: "${name}" is used twice.`);
    }
    const type = (fields.type ?? "string") as FieldType;
    if (!FIELD_TYPES.includes(type)) {
      throw new Error(
        `Field ${index + 1}: unknown type ${JSON.stringify(type)}. Expected ${FIELD_TYPES.join(", ")}.`,
      );
    }
    const description =
      typeof fields.description === "string" && fields.description.trim()
        ? fields.description.trim()
        : undefined;
    // Strict mode wants every property listed; optional ones may be null.
    properties[key] =
      fields.isRequired === true
        ? { type, ...(description && { description }) }
        : {
            type: [type, "null"],
            description: `${description ? `${description} ` : ""}Null when the text does not contain it.`,
          };
    names[key] = name;
  });
  return {
    schema: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
    names,
    strict: true,
  };
}

function advancedSchema(value: unknown): ExtractSchema {
  let schema = value;
  if (typeof schema === "string") {
    try {
      schema = JSON.parse(schema);
    } catch {
      throw new Error("The JSON Schema is not valid JSON.");
    }
  }
  if (
    schema === null ||
    typeof schema !== "object" ||
    Array.isArray(schema) ||
    (schema as JSONSchema7).type !== "object"
  ) {
    throw new Error(
      'The JSON Schema must describe an object ("type": "object").',
    );
  }
  return { schema: schema as JSONSchema7, names: {}, strict: false };
}

export function buildExtractSchema(mode: Mode, fields: unknown): ExtractSchema {
  return mode === "advanced" ? advancedSchema(fields) : simpleSchema(fields);
}

function restoreNames(data: unknown, names: Record<string, string>): unknown {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      Object.hasOwn(names, key) ? names[key] : key,
      value,
    ]),
  );
}

export async function extract(
  model: ChatModel,
  options: {
    text: unknown;
    prompt?: string;
    schema: ExtractSchema;
    maxOutputTokens?: number;
  },
) {
  const text = toText(options.text);
  if (!text) throw new Error("The text to extract from is empty.");
  const result = await generateText({
    model,
    instructions: options.prompt?.trim() || DEFAULT_PROMPT,
    prompt: `Text to analyze:\n${text}`,
    output: Output.object({
      name: "extracted_data",
      schema: jsonSchema<Record<string, unknown>>(options.schema.schema),
    }),
    maxOutputTokens: options.maxOutputTokens,
    temperature: 0,
    ...schemaOptions(options.schema.strict),
  });
  return {
    data: restoreNames(result.output, options.schema.names),
    usage: toUsage(result.usage),
  };
}

// Field list or raw JSON Schema, following the mode.
function dataDefinition(mode: unknown) {
  if (mode === "advanced") {
    return {
      fields: Property.Json({
        displayName: "JSON Schema",
        description:
          "JSON Schema of the output object. See json-schema.org to learn more.",
        required: true,
        defaultValue: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
        },
      }),
    };
  }
  return {
    fields: Property.Array({
      displayName: "Fields",
      required: true,
      properties: {
        name: Property.ShortText({
          displayName: "Name",
          required: true,
          description: "Short, unique name for this value in the output.",
          placeholder: "e.g. invoice_total",
        }),
        description: Property.LongText({
          displayName: "Description",
          required: false,
          description: "Tells the AI what to look for.",
          placeholder: "e.g. Total due, including tax",
        }),
        type: Property.StaticDropdown<FieldType>({
          displayName: "Data type",
          required: true,
          defaultValue: "string",
          options: {
            options: [
              { label: "Text", value: "string" },
              { label: "Number", value: "number" },
              { label: "Boolean", value: "boolean" },
            ],
          },
        }),
        isRequired: Property.Checkbox({
          displayName: "Required",
          required: false,
          defaultValue: false,
          description:
            "Asks the AI to always fill this field. Optional fields are null when absent.",
        }),
      },
    }),
  };
}

export const extractAction = createAction({
  auth: aiAuth,
  name: "extract",
  displayName: "Extract structured data",
  description: "Pull names, amounts and other fields out of text.",
  defaultTimeoutSeconds: 120,
  propertyGroups: [
    {
      key: "fields",
      display: "section",
      label: "What to extract",
      icon: "braces",
      props: ["prompt", "mode", "schema"],
    },
  ],
  props: {
    model: modelProp(),
    text: Property.LongText({
      displayName: "Text",
      required: true,
      description:
        "Text or JSON to extract from, usually from an earlier step.",
    }),
    prompt: Property.LongText({
      displayName: "Prompt",
      required: false,
      description: "Extra guidance for the AI, like a date format to use.",
      defaultValue: DEFAULT_PROMPT,
    }),
    mode: Property.StaticDropdown<Mode>({
      displayName: "Data schema type",
      required: true,
      defaultValue: "simple",
      options: {
        options: [
          { label: "Simple: list fields", value: "simple" },
          { label: "Advanced: JSON Schema", value: "advanced" },
        ],
      },
    }),
    schema: Property.DynamicProperties({
      auth: undefined,
      displayName: "Data definition",
      required: true,
      refreshers: ["mode"],
      props: (propsValue) =>
        Promise.resolve(dataDefinition(propsValue.mode as unknown)),
    }),
    maxOutputTokens: maxOutputTokensProp(),
  },
  run: async (ctx) => {
    const connection = readConnection(ctx.auth);
    const schema = buildExtractSchema(
      ctx.propsValue.mode ?? "simple",
      (ctx.propsValue.schema as Record<string, unknown> | undefined)?.fields,
    );
    const model = await createLanguageModel(
      connection,
      resolveModelId(connection, ctx.propsValue.model),
    );
    return extract(model, {
      text: ctx.propsValue.text,
      prompt: ctx.propsValue.prompt,
      schema,
      maxOutputTokens: positive(ctx.propsValue.maxOutputTokens),
    });
  },
});
