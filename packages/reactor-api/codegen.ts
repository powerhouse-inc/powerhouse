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
          JSONObject: "unknown",
          DateTime: "string | Date",
        },
        scalarSchemas: {
          JSONObject: "z.custom<unknown>((v) => v != null)",
          DateTime: "z.union([z.string(), z.date()])",
        },
        useIndexSignature: true,
        useTypeImports: true,
        strictScalars: true,
        skipTypename: true,
        enumsAsTypes: false,
        constEnums: false,
        immutableTypes: true,
        maybeValue: "T | null | undefined",
        arrayInputCoercion: false,
        schema: "zodv4",
        gqlImport: "graphql-tag#gql",
        withObjectType: true,
      },
    },
  },
};

export default config;
