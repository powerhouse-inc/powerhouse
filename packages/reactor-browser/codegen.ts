import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../reactor-api/src/graphql/reactor/*.graphql",
  documents: ["../reactor-api/src/graphql/reactor/operations.graphql"],
  generates: {
    "./src/graphql/gen/schema.ts": {
      plugins: [
        "typescript",
        "typescript-operations",
        "typescript-graphql-request",
      ],
      config: {
        scalars: {
          JSONObject: "NonNullable<unknown>",
          DateTime: "string | Date",
        },
        skipTypename: true,
        enumsAsTypes: false,
        constEnums: false,
        immutableTypes: true,
        maybeValue: "T | null | undefined",
        arrayInputCoercion: false,
        gqlImport: "graphql-tag#gql",
      },
    },
  },
};

export default config;
