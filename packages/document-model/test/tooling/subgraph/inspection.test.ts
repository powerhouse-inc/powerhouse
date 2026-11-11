import { describe, expect, it } from "vitest";
import { ph } from "../../../src/definition/index.js";
import { inspectProjectDefinitions } from "../../../src/definition/tooling/inspect/inspect-project-definitions.js";
import type { LoadedDefinitionProject } from "../../../src/definition/tooling/report/types.js";
import { subgraphCheckInput } from "../../../src/definition/tooling/subgraph/input.js";
import { withSubgraphInspection } from "../../../src/definition/tooling/subgraph/inspection.js";
import { readSubgraphDefinitions } from "../../../src/definition/tooling/subgraph/read.js";
import { codeFirst, sourceSet } from "./fixture.js";

const Item = ph.object("Item", { fields: { id: ph.OID({ required: true }) } });
const Shape = ph.union("Shape", { members: [Item] });

const items = codeFirst("items", (schema) => [
  schema.query("items", {
    type: ph.list(ph.ref(Item, { required: true }), { required: true }),
    resolve: () => [],
  }),
  schema.mutation("touch", { type: ph.ref(Shape), resolve: () => null }),
  schema.field(Item, "size", { type: ph.Int(), resolve: () => 1 }),
  schema.resolveType(Shape, () => "Item"),
]);

const project: LoadedDefinitionProject = {
  sourceSet: sourceSet(),
  artifacts: [],
  unregistered: [],
  diagnostics: [],
  skipReason: "no-document-models",
};

describe("withSubgraphInspection", () => {
  it("adds a subgraphs section and counts subgraphs toward the status", () => {
    const report = inspectProjectDefinitions(project);
    expect(report.status).toBe("skipped");
    const { input, inventory } = subgraphCheckInput({
      definitions: readSubgraphDefinitions({ ItemsSubgraph: items }),
      schemaFirst: [
        {
          unit: "./subgraphs/sdl/",
          name: "sdl",
          source: { specifier: "./subgraphs/sdl/schema.ts" },
          language: "typescript",
          text: "",
        },
      ],
    });
    const inspected = withSubgraphInspection(project, report, input);
    expect(inspected.status).toBe("ok");
    expect(inspected.subgraphs).toEqual([
      {
        style: "code-first",
        name: "items",
        source: {
          specifier: "./subgraphs/index.ts",
          exportPath: ["ItemsSubgraph"],
        },
        digest: inventory[0].digest,
        hasSubscriptions: false,
        entries: ["Query.items", "Mutation.touch", "Item.size", "Shape"],
        types: ["Item", "Shape"],
        scalars: [{ name: "OID", implementation: "powerhouse.catalog#OID" }],
      },
      {
        style: "schema-first",
        name: "sdl",
        source: { specifier: "./subgraphs/sdl/schema.ts" },
      },
    ]);
  });

  it("carries the subgraph read diagnostics and their status", () => {
    const thrown = codeFirst("thrown", () => {
      throw new Error("boom");
    });
    const { input } = subgraphCheckInput({
      definitions: readSubgraphDefinitions({ Thrown: thrown }),
    });
    const inspected = withSubgraphInspection(
      project,
      inspectProjectDefinitions(project),
      input,
    );
    expect(inspected.status).toBe("failed");
    expect(inspected.subgraphs).toEqual([]);
    expect(inspected.diagnostics.map(({ code }) => code)).toEqual([
      "PH-SG-DESCRIBE-FAILED",
    ]);
  });
});
