import { ts } from "@tmpl/core";

export const customSubgraphSchemaTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
}) =>
  ts`
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql\`
"""
${v.pascalCaseName} Queries
"""
type ${v.pascalCaseName}Queries {
    example(driveId: String!): String
}

type Query {
    ${v.camelCaseName}: ${v.pascalCaseName}Queries!
}

\`
`.raw;
