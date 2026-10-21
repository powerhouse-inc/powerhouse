import { gql } from "graphql-tag";
import type { CoreSubgraphSchema } from "../../../src/graphql/subgraph-types.js";
import schemaSource from "./packages.graphql";

export const packagesSchema = {
  subgraphName: "packages",
  typeDefs: gql(schemaSource),
  resolverCoordinates: [
    { typeName: "Mutation", fieldName: "Packages", resolverKind: "field" },
    {
      typeName: "PackagesMutations",
      fieldName: "installPackage",
      resolverKind: "field",
    },
    {
      typeName: "PackagesMutations",
      fieldName: "uninstallPackage",
      resolverKind: "field",
    },
    {
      typeName: "PackagesQueries",
      fieldName: "installedPackage",
      resolverKind: "field",
    },
    {
      typeName: "PackagesQueries",
      fieldName: "installedPackages",
      resolverKind: "field",
    },
    { typeName: "Query", fieldName: "Packages", resolverKind: "field" },
  ],
} as const satisfies CoreSubgraphSchema;
