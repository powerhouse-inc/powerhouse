import { buildSchema } from "graphql";
import { typeDefs } from "@powerhousedao/scalars";

export const hiddenQueryTypeDefDoc = `type Query {
  _hidden: String
}
`;

export const typeDefsDoc = typeDefs.join("\n");

export const initialSchemaDoc = `${hiddenQueryTypeDefDoc}\n${typeDefsDoc}`;

export const initialSchema = buildSchema(initialSchemaDoc);

export const specialDocIds = {
  hiddenQueryTypeDef: "hidden-query-type-defs",
  standardLib: "standard-lib",
  global: "global",
  local: "local",
} as const;

export const updateTimeout = 5000;
