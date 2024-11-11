import { options, transmit } from "./listener";
import { resolvers } from "./resolvers";

const typeDefs = `
 type Query {
  compensation(projectCode: String, token: String): [Compensation!]!
}

type Compensation {
  projectCode: String!
  amount: Int!
  token: String!
  updatedAt: DateTime!
}
`;

export { options, resolvers, transmit, typeDefs };
