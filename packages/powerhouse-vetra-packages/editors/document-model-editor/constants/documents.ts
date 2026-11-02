import { documentModelScalars } from "document-model/scalars";
import { buildSchema, printSchema } from "graphql";

export const hiddenQueryTypeDefDoc = `type Query {
  _hidden: String
}
`;

/** The scalars every model may use without declaring them, by name. */
export const standardLibScalars = new Map(
  documentModelScalars.map((definition) => [definition.name, definition]),
);

export const typeDefsDoc = Array.from(
  standardLibScalars.keys(),
  (name) => `scalar ${name}`,
).join("\n");

export const initialSchemaDoc = `${hiddenQueryTypeDefDoc}\n${typeDefsDoc}`;

export const initialSchema = buildSchema(initialSchemaDoc);
export const initialSchemaStr = printSchema(initialSchema);

export const specialDocIds = {
  hiddenQueryTypeDef: "hidden-query-type-defs",
  standardLib: "standard-lib",
  global: "global",
  local: "local",
} as const;

export const updateTimeout = 5000;
