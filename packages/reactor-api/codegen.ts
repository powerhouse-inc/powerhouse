import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./src/graphql/reactor/*.graphql",
  documents: ["./src/graphql/reactor/operations.graphql"],
  generates: {
    "./src/graphql/reactor/gen/graphql.ts": {
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-resolvers",
        "typescript-validation-schema",
        "typescript-generic-sdk",
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
        gqlImport: "graphql-tag#gql",
      },
    },
  },
};

export default config;
