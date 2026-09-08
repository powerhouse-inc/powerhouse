import { parse, type DocumentNode } from "graphql";

/**
 * Deliberately ordered so a typed rebuild would reorder it. Compatibility mode
 * must preserve this exact definition and field order.
 */
export const schema: DocumentNode = parse(`
type ExampleQueries {
  zebra(driveId: String!): String
  alpha: Int
}

type Query {
  example: ExampleQueries!
}
`);
