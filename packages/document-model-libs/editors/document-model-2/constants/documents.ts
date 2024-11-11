import { buildSchema } from "graphql";
import { typeDefs } from "@powerhousedao/scalars";

export const hiddenQueryTypeDefDoc = `type Query {
  _hidden: String
}
${typeDefs.join("\n")}
`;

export const initialSchema = buildSchema(hiddenQueryTypeDefDoc);
