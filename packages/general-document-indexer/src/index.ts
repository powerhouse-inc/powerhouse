import { options, transmit } from "./listener";
import { resolvers } from "./resolvers";
import * as dbSchema from "./schema";

const typeDefs = `
type Query {
  search(title: String!, type: String!): [SearchResult!]!
}

type SearchResult {
  driveId: String!
  documentId: String!
  title: String!
  type: String!
}
`;

export { dbSchema, options, resolvers, transmit, typeDefs };
