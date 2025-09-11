import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./src/graphql/reactor/schema.graphql",
  documents: [
    "./src/graphql/reactor/**/*.graphql",
    "!./src/graphql/reactor/schema.graphql",
  ],
  generates: {
    "./src/graphql/reactor/generated/graphql.ts": {
      plugins: [
        {
          add: {
            content: "/* eslint-disable */",
          },
        },
        "typescript",
        "typescript-operations",
        "typescript-resolvers",
      ],
      config: {
        contextType: "../../types.js#Context",
        scalars: {
          JSONObject: "any",
          DateTime: "string | Date",
        },
        useIndexSignature: true,
        strictScalars: true,
        skipTypename: true,
        enumsAsTypes: false,
        constEnums: false,
        immutableTypes: true,
        maybeValue: "T | null | undefined",
      },
    },
    "./src/graphql/reactor/generated/sdk.ts": {
      plugins: [
        {
          add: {
            content:
              "/* eslint-disable */\nimport * as Types from './graphql.js';",
          },
        },
        "typescript",
        "typescript-operations",
        "typescript-generic-sdk",
      ],
      config: {
        documentMode: "documentNode",
      },
    },
    "./src/graphql/reactor/generated/typed-document-nodes.ts": {
      plugins: [
        {
          add: {
            content: "/* eslint-disable */",
          },
        },
        "typescript",
        "typescript-operations",
        "typed-document-node",
      ],
      config: {
        scalars: {
          JSONObject: "any",
          DateTime: "string | Date",
        },
        strictScalars: true,
        skipTypename: true,
      },
    },
    "./src/graphql/reactor/generated/zod-schemas.ts": {
      plugins: [
        {
          add: {
            content: "/* eslint-disable */",
          },
        },
        "typescript-validation-schema",
      ],
      config: {
        schema: "zod",
        scalarSchemas: {
          JSONObject: "z.unknown()",
          DateTime: "z.union([z.string(), z.date()])",
        },
        scalars: {
          JSONObject: "any",
          DateTime: "string | Date",
        },
        strictScalars: true,
        importFrom: "./graphql.js",
      },
    },
  },
};

export default config;
