import {
  GRAPHQL_PACKAGE,
  GRAPHQL_TAG_PACKAGE,
} from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const customSubgraphSchemaTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
}) =>
  ts`
import { gql } from "${GRAPHQL_TAG_PACKAGE}";
import type { DocumentNode } from "${GRAPHQL_PACKAGE}";

export const schema: DocumentNode = gql\`
"""
${v.pascalCaseName} Subgraph Queries
"""
type ${v.pascalCaseName}SubgraphQueries {
    example(driveId: String!): String
}

type Query {
    ${v.camelCaseName}: ${v.pascalCaseName}SubgraphQueries!
}

\`
`.raw;
