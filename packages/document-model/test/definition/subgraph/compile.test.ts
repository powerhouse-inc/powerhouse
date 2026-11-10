import type { TypeReferenceDefinition } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  compileSubgraph,
  createSubgraphEntryBuilders,
  ph,
  type SubgraphEntry,
} from "../../../src/definition/index.js";
import {
  type Info,
  Invoice,
  Line,
  type Request,
  type ShopSubgraph,
} from "./fixture.js";

const schema = createSubgraphEntryBuilders<ShopSubgraph, Request, Info>();

const scalar = (name: string, required: boolean): TypeReferenceDefinition => ({
  kind: "scalar",
  name,
  required,
});

function compiled(
  entries: readonly SubgraphEntry<ShopSubgraph, Request, Info>[],
) {
  const result = compileSubgraph({ name: "shop", entries });
  expect(result.diagnostics).toStrictEqual([]);
  if (result.definition === undefined) throw new Error("no definition");
  return result.definition;
}

const none = () => null;

describe("compileSubgraph", () => {
  it("binds a computed field whose parent only another computed field reaches", () => {
    const definition = compiled([
      schema.field(Invoice, "lineCount", {
        type: ph.Int({ required: true }),
        resolve: ({ parent }) => parent.lines.length,
      }),
      schema.field(Line, "invoice", {
        type: ph.ref(Invoice, { required: true }),
        resolve: none as never,
      }),
      schema.query("line", { type: ph.ref(Line), resolve: none }),
    ]);
    expect(
      definition.entries.map((entry) =>
        entry.kind === "computed-field"
          ? `${entry.typeName}.${entry.fieldName}`
          : entry.kind,
      ),
    ).toStrictEqual(["query", "InvoiceLine.invoice", "Invoice.lineCount"]);
  });

  it("lets a computed field satisfy an interface of its object type", () => {
    const Named = ph.interface("Named", {
      fields: { label: ph.String({ required: true }) },
    });
    const Thing = ph.object("Thing", {
      implements: [Named],
      fields: { id: ph.ID({ required: true }) },
    });
    const definition = compiled([
      schema.query("thing", { type: ph.ref(Thing), resolve: none }),
      schema.field(Thing, "label", {
        type: ph.String({ required: true }),
        resolve: () => "label",
      }),
    ]);
    expect(
      definition.types.map((type) =>
        type.kind === "object" || type.kind === "interface"
          ? [type.name, type.implements, type.fields.map(({ name }) => name)]
          : [type.name],
      ),
    ).toStrictEqual([
      ["Thing", ["Named"], ["id", "label"]],
      ["Named", undefined, ["label"]],
    ]);
  });

  it("serves a type that only an interface leads to through schema.type", () => {
    const Named = ph.interface("Named", {
      fields: { label: ph.String({ required: true }) },
    });
    const Tag = ph.object("Tag", { fields: { text: ph.String() } });
    const Thing = ph.object("Thing", {
      implements: [Named],
      fields: { label: ph.String({ required: true }), tag: ph.ref(Tag) },
    });
    const result = compileSubgraph({
      name: "shop",
      entries: [
        schema.query("named", { type: ph.ref(Named), resolve: none }),
        schema.resolveType(Named, () => "Thing"),
        schema.type(Thing),
      ],
    });
    expect(result.diagnostics).toStrictEqual([]);
    expect([
      result.definition?.types.map(({ name }) => name),
      result.definition?.entries.map(({ kind }) => kind),
      [...result.bindings.keys()],
    ]).toStrictEqual([
      ["Named", "Thing", "Tag"],
      ["query", "resolve-type"],
      ["Query.named", "Named"],
    ]);
  });

  it("builds an object type whose fields all come from computed entries", () => {
    const SystemStatus = ph.object("SystemStatus", { fields: {} });
    const definition = compiled([
      schema.query("status", { type: ph.ref(SystemStatus), resolve: none }),
      schema.field(SystemStatus, "currentTime", {
        type: ph.String(),
        resolve: () => "now",
      }),
    ]);
    expect(definition.types).toStrictEqual([
      {
        kind: "object",
        name: "SystemStatus",
        description: null,
        fields: [
          {
            key: "currentTime",
            name: "currentTime",
            description: null,
            deprecated: null,
            type: scalar("String", false),
          },
        ],
      },
    ]);
  });
});
