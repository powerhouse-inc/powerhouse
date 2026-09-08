import { ts } from "@tmpl/core";

export type CodeFirstSubgraphTemplateVariables = {
  camelCaseName: string;
  kebabCaseName: string;
  pascalCaseName: string;
};

export const codeFirstSubgraphTemplate = (
  v: CodeFirstSubgraphTemplateVariables,
) =>
  ts`
import { defineSubgraph } from "@powerhousedao/reactor-api";
import { ph } from "document-model";

export const ${v.pascalCaseName}Subgraph = defineSubgraph({
  name: "${v.kebabCaseName}",
  schemaKind: "typed",
  entries: (builder) => [
    builder.query("${v.camelCaseName}", {
      returns: ph.String({ required: true }),
      resolve() {
        return "${v.kebabCaseName}-ok";
      },
    }),
  ],
});
`.raw;

export const codeFirstSubgraphTestTemplate = (
  v: CodeFirstSubgraphTemplateVariables,
) =>
  ts`
import { describe, expect, it } from "vitest";
import { ${v.pascalCaseName}Subgraph } from "./index.js";

describe("${v.pascalCaseName}Subgraph", () => {
  it("publishes a typed definition", () => {
    expect(${v.pascalCaseName}Subgraph.definition.name).toBe(
      "${v.kebabCaseName}",
    );
    expect(${v.pascalCaseName}Subgraph.definition.schemaKind).toBe("typed");
  });
});
`.raw;
