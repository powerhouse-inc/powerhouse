import { GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";

export const initialStateDoc = `type State {
  examples: [String!]!
}`;

export const initialLocalStateDoc = `type LocalState {
  localExamples: [String!]!
}`;

export const hiddenQueryTypeDefDoc = `type Query {
  _hidden: String
}`;

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

export const STATE_DOC_ID = "STATE_DOC_ID" as const;
export const LOCAL_STATE_DOC_ID = "LOCAL_STATE_DOC_ID" as const;
export const INITIAL_STATE_DOC_ID = "INITIAL_STATE_DOC_ID" as const;
export const INITIAL_LOCAL_STATE_DOC_ID = "INITIAL_LOCAL_STATE_DOC_ID" as const;
export const STANDARD_LIB_DOC_ID = "STANDARD_LIB_DOC_ID" as const;

export const SPECIAL_DOC_IDS: string[] = [
  STATE_DOC_ID,
  LOCAL_STATE_DOC_ID,
  INITIAL_STATE_DOC_ID,
  INITIAL_LOCAL_STATE_DOC_ID,
  STANDARD_LIB_DOC_ID,
];
