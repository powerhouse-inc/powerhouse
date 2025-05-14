import { typeDefs } from "@powerhousedao/document-engineering/graphql";
import { buildSchema } from "graphql";

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
