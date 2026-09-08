import { defineDocumentModel, ph } from "document-model";
import { buildSchema, parse } from "graphql";
import { describe, expect, it } from "vitest";

describe("empty materialized SDL", () => {
  it("keeps empty state, interface, and operation input schemas parseable", () => {
    const EmptyNode = ph.interface("EmptyNode", { fields: {} });
    const EmptyState = ph.object("EmptySdlState", {
      fields: {},
      implements: [EmptyNode],
    });
    const model = defineDocumentModel({
      id: "fixture/empty-sdl",
      name: "Empty SDL",
      description: "Empty compatibility schema probe.",
      extension: "empty-sdl",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: { schema: EmptyState, initialValue: {} },
        local: { schema: null, initialValue: {} },
      },
    });
    const operations = model.module("empty", {
      operations: ({ global }) => ({
        touch: global({
          input: ph.input({ fields: {} }),
          reduce() {},
        }),
      }),
    });
    const module = model.finalize({ modules: [operations] });
    const specification = module.documentModel.global.specifications[0]!;
    const operation = specification.modules[0]!.operations[0]!;
    const materialized = `${specification.state.global.schema}\n${operation.schema}`;

    expect(materialized).not.toContain("{\n\n}");
    expect(materialized).toContain("_phEmptyEmptyNode: Boolean");
    expect(materialized).toContain("_phEmpty: Boolean");
    expect(() => parse(materialized)).not.toThrow();
    expect(() => buildSchema(materialized)).not.toThrow();
  });
});
