import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./src/graphql/reactor/*.graphql",
  generates: {
    "./src/graphql/reactor/gen/graphql.ts": {
      plugins: [
        {
          add: {
            content: "/* eslint-disable */",
          },
        },
        "typescript",
        "typescript-operations",
        "typescript-resolvers",
        "typescript-generic-sdk",
        "typed-document-node",
        "typescript-validation-schema",
      ],
      config: {
        contextType: "../../types.js#Context",
        scalars: {
          JSONObject: "any",
          DateTime: "string | Date",
        },
        scalarSchemas: {
          JSONObject: "z.unknown()",
          DateTime: "z.union([z.string(), z.date()])",
        },
        useIndexSignature: true,
        strictScalars: true,
        skipTypename: true,
        enumsAsTypes: false,
        constEnums: false,
        immutableTypes: true,
        maybeValue: "T | null | undefined",
        schema: "zod",
      },
    },
  },
};

export default config;
