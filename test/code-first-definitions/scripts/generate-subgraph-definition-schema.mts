import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const modelSchema = JSON.parse(
  await readFile(
    resolve(packageRoot, "schemas/document-model-definition-v1.schema.json"),
    "utf8",
  ),
) as { readonly definitions: Readonly<Record<string, unknown>> };

const access = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: { kind: { const: "public" } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind"],
      properties: { kind: { const: "manual" } },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "argument"],
      properties: {
        kind: { const: "document-read" },
        argument: { $ref: "#/definitions/graphqlNameString" },
      },
    },
  ],
};

const entry = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "key",
        "fieldName",
        "description",
        "args",
        "returns",
        "access",
        "compatibilityName",
      ],
      properties: {
        kind: { enum: ["query", "mutation", "subscription"] },
        key: { $ref: "#/definitions/graphqlNameString" },
        fieldName: { $ref: "#/definitions/graphqlNameString" },
        description: { type: ["string", "null"] },
        args: {
          type: "array",
          items: { $ref: "#/definitions/inputField" },
        },
        returns: { $ref: "#/definitions/typeReference" },
        access: { $ref: "#/definitions/subgraphAccess" },
        compatibilityName: {
          anyOf: [
            { $ref: "#/definitions/graphqlNameString" },
            { type: "null" },
          ],
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "target", "access"],
      properties: {
        kind: { const: "field" },
        target: {
          type: "object",
          additionalProperties: false,
          required: ["typeName", "fieldName"],
          properties: {
            typeName: { $ref: "#/definitions/graphqlNameString" },
            fieldName: { $ref: "#/definitions/graphqlNameString" },
          },
        },
        access: { $ref: "#/definitions/subgraphAccess" },
      },
    },
    ...["resolveType", "isTypeOf"].map((kind) => ({
      type: "object",
      additionalProperties: false,
      required: ["kind", "typeName"],
      properties: {
        kind: { const: kind },
        typeName: { $ref: "#/definitions/graphqlNameString" },
      },
    })),
  ],
};

const commonProperties = {
  kind: { const: "powerhouse.subgraph" },
  formatVersion: { const: 1 },
  name: { type: "string", minLength: 1 },
  compositionPolicy: { const: "host-current" },
  federationProfile: { const: "host-current" },
};

const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://powerhouse.inc/schemas/subgraph-definition-v1.json",
  title: "Powerhouse subgraph definition V1",
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "formatVersion",
        "name",
        "compositionPolicy",
        "federationProfile",
        "schemaKind",
        "hasSubscriptions",
        "types",
        "entries",
        "scalars",
      ],
      properties: {
        ...commonProperties,
        schemaKind: { const: "typed" },
        hasSubscriptions: { type: "boolean" },
        types: {
          type: "array",
          items: { $ref: "#/definitions/namedType" },
        },
        entries: {
          type: "array",
          items: { $ref: "#/definitions/subgraphEntry" },
        },
        scalars: {
          type: "array",
          items: { $ref: "#/definitions/subgraphScalarReference" },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "formatVersion",
        "name",
        "compositionPolicy",
        "federationProfile",
        "schemaKind",
        "hasSubscriptions",
        "document",
        "resolverCoordinates",
        "access",
      ],
      properties: {
        ...commonProperties,
        schemaKind: { const: "graphql-ast-compat" },
        hasSubscriptions: { type: ["boolean", "null"] },
        document: { $ref: "#/definitions/astDocument" },
        resolverCoordinates: {
          type: "array",
          items: { $ref: "#/definitions/resolverCoordinate" },
        },
        access: { const: "manual" },
      },
    },
  ],
  definitions: {
    ...modelSchema.definitions,
    subgraphAccess: access,
    subgraphEntry: entry,
    subgraphScalarReference: {
      type: "object",
      additionalProperties: false,
      required: ["name", "implementation", "graphQLProfile"],
      properties: {
        name: { $ref: "#/definitions/scalarName" },
        implementation: {
          type: "string",
          pattern: "^powerhouse\\.catalog#.+$",
        },
        graphQLProfile: { const: "legacy-graphql-default-v1" },
      },
    },
    resolverCoordinate: {
      type: "object",
      additionalProperties: false,
      required: ["typeName", "fieldName", "resolverKind"],
      properties: {
        typeName: { $ref: "#/definitions/graphqlNameString" },
        fieldName: {
          anyOf: [
            { $ref: "#/definitions/graphqlNameString" },
            { type: "null" },
          ],
        },
        resolverKind: {
          enum: [
            "field",
            "subscribe",
            "resolve",
            "resolveType",
            "isTypeOf",
            "enum",
            "scalar",
          ],
        },
      },
    },
  },
};

await writeFile(
  resolve(packageRoot, "schemas/subgraph-definition-v1.schema.json"),
  `${JSON.stringify(schema, null, 2)}\n`,
);
