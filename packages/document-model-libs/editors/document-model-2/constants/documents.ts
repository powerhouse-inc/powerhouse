import { GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql";
import { typeDefs } from "@powerhousedao/scalars";

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
