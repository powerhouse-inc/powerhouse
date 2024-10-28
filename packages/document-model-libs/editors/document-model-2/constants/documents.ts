import { GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { typeDefs } from "@powerhousedao/scalars";

export const initialStateDoc = `type State {
  examples: [String!]!
}`;

export const initialLocalStateDoc = `type LocalState {
  localExamples: [String!]!
}`;

export const hiddenQueryTypeDefDoc = `type Query {
  _hidden: String
}
${typeDefs.join("\n")}
`;

export const query = new GraphQLObjectType({
  name: "Query",
  fields: {
    _hidden: {
      type: GraphQLString,
    },
  },
});

export const initialSchema = new GraphQLSchema({
  query,
});

export const STATE_DOC_ID = "STATE_DOC_ID";
export const LOCAL_STATE_DOC_ID = "LOCAL_STATE_DOC_ID";
export const STANDARD_LIB_DOC_ID = "STANDARD_LIB_DOC_ID";
export const HIDDEN_QUERY_TYPE_DEF_DOC_ID = "HIDDEN_QUERY_TYPE_DEF_DOC_ID";
