import { options, transmit } from "./listener";
import { resolvers } from "./resolvers";

const typeDefs = `
 type Query {
  powtComp: [POWtComp!]!
}

type POWtComp {
  projectCode: String!
  amount: Int!
}
`;

export { options, resolvers, transmit, typeDefs };
