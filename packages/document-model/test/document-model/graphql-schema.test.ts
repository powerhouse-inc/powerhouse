// The GraphQL inputs in schemas/document-model match the operation schemas
// the document model ships, which reactor-mcp's getDocumentModelSchema returns.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { documentModelDocumentModelModule } from "../../index.js";

const schemasDir = join(import.meta.dirname, "../../schemas/document-model");

function normalize(definition: string) {
  return definition.replace(/^(input|type)\s+/, "").replace(/\s+/g, " ");
}

function graphqlDefinitions() {
  const definitions = new Map<string, string>();
  for (const file of readdirSync(schemasDir)) {
    const source = readFileSync(join(schemasDir, file), "utf8");
    for (const match of source.matchAll(/(?:input|type) (\w+) \{[^}]*\}/g)) {
      definitions.set(match[1], normalize(match[0]));
    }
  }
  return definitions;
}

const operations =
  documentModelDocumentModelModule.documentModel.global.specifications
    .at(-1)!
    .modules.flatMap((module) => module.operations)
    .filter((operation) => operation.schema);

describe("schemas/document-model", () => {
  const definitions = graphqlDefinitions();

  it.each(operations.map((operation) => [operation.name, operation.schema!]))(
    "defines the input of %s as the spec does",
    (_name, schema) => {
      const inputName = /input (\w+)/.exec(schema)![1];
      expect(definitions.get(inputName)).toBe(normalize(schema));
    },
  );

  it("gives ADD_OPERATION a scope", () => {
    expect(definitions.get("AddOperationInput")).toContain("scope: String");
  });
});
