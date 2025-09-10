import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./src/graphql/reactor/schema.graphql",
  generates: {
    "./src/graphql/reactor/generated/graphql.ts": {
      plugins: ["typescript", "typescript-operations", "typescript-resolvers"],
      config: {
        contextType: "../context.js#Context",
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
    "./src/graphql/reactor/generated/zod-schemas.ts": {
      plugins: ["typescript-validation-schema"],
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
