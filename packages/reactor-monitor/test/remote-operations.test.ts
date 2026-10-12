import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  buildSchema,
  Kind,
  parse,
  validate,
  type GraphQLSchema,
} from "graphql";
import { describe, expect, it } from "vitest";
import { INSPECTION_OPERATIONS } from "../src/index.js";

// The server's SDL, read as text: this package must not depend on reactor-api.
function inspectionSchema(): GraphQLSchema {
  const file = fileURLToPath(
    new URL(
      "../../reactor-api/src/graphql/inspection/schema.ts",
      import.meta.url,
    ),
  );
  const sdl = /gql`([\s\S]*?)`/.exec(readFileSync(file, "utf8"))?.[1];
  if (!sdl) {
    throw new Error(`no gql template in ${file}`);
  }
  return buildSchema(`scalar JSONObject\n${sdl}`);
}

function errorsOf(schema: GraphQLSchema, document: string): string[] {
  return validate(schema, parse(document)).map((error) => error.message);
}

describe("INSPECTION_OPERATIONS against reactor-api's inspection SDL", () => {
  const schema = inspectionSchema();

  it.each(Object.entries(INSPECTION_OPERATIONS))(
    "%s validates",
    (_name, document) => {
      expect(errorsOf(schema, document)).toEqual([]);
    },
  );

  // `validate` passes a mutation against a schema with no Mutation type.
  it("sends queries only", () => {
    const kinds = Object.values(INSPECTION_OPERATIONS).flatMap((document) =>
      parse(document).definitions.map((definition) =>
        definition.kind === Kind.OPERATION_DEFINITION
          ? definition.operation
          : definition.kind,
      ),
    );
    expect(new Set(kinds)).toEqual(new Set(["query"]));
  });

  it("refuses an object field selected without a sub-selection", () => {
    expect(
      errorsOf(
        schema,
        "query Q { inspection { info { storage workflows syncChannels access } } }",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /Field "storage" of type .* must have a selection/,
        ),
      ]),
    );
  });
});
