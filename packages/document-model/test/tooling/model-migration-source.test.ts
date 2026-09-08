import type {
  DocumentModelDefinitionV1,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  inferLegacyReducerBindings,
  renderCodeFirstDocumentModelFamily,
} from "../../src/tooling/model-migration-source.js";

const definition = {
  model: {
    documentType: "test/stable-model",
    graphQLName: "StableModel",
    name: "!!!",
    description: "",
    extension: "stable",
    author: { name: "Test", website: null },
  },
  specifications: [
    {
      version: 1,
      types: [
        {
          kind: "object",
          name: "StableModelState",
          description: null,
          fields: [],
        },
      ],
      state: {
        global: {
          root: { kind: "named", name: "StableModelState", required: true },
          initialValue: {},
          examples: [],
        },
        local: { root: null, initialValue: {}, examples: [] },
      },
      modules: [
        {
          key: "operations",
          description: null,
          operations: [
            {
              key: "SET_VALUE",
              creatorKey: "setValue",
              actionType: "SET_VALUE",
              scope: "global",
              description: null,
              input: {
                kind: "input",
                name: "SetValueInput",
                fields: [],
              },
              errors: [],
              examples: [],
              template: null,
              reducer: null,
            },
          ],
        },
      ],
      changeLog: [],
    },
  ],
} as unknown as DocumentModelDefinitionV1;

const request = {
  definition,
  materializedSpecifications: [{} as DocumentSpecification],
  reducerBindings: [
    {
      version: 1,
      moduleKey: "operations",
      importSpecifier: "./legacy.js" as const,
      exportName: "stableModelOperations",
    },
  ],
};

describe("code-first migration source renderer", () => {
  it("preserves the stored operation key and uses the recorded GraphQL name", () => {
    const source = renderCodeFirstDocumentModelFamily(request);

    expect(source).toContain("function createStableModelV1() {");
    expect(source).toContain('"SET_VALUE": global({');
    expect(source).not.toContain('"setValue": global({');
    expect(source).toContain('"setValueOperation", state, action, dispatch');
    expect(source).toContain(
      'legacyReducersV1M0, "stableModelOperations", "setValueOperation"',
    );
    expect(source).not.toContain("Object.values(namespace)");
  });

  it("rejects an explicit export base that cannot form TypeScript bindings", () => {
    expect(() =>
      renderCodeFirstDocumentModelFamily({
        ...request,
        exportBase: "invalid-name",
      }),
    ).toThrow("PH-MIGRATE-EXPORT-NAME-INVALID");
  });

  it("maps GraphQL names to safe locals and orders eager dependencies", () => {
    const hazardous = structuredClone(definition) as unknown as {
      specifications: Array<Record<string, unknown>>;
    };
    hazardous.specifications[0] = {
      ...hazardous.specifications[0],
      types: [
        {
          kind: "union",
          name: "class",
          description: null,
          members: ["ph"],
        },
        {
          kind: "object",
          name: "ph",
          description: null,
          implements: ["model"],
          fields: [
            {
              key: "value",
              name: "value",
              description: null,
              deprecated: null,
              type: { kind: "named", name: "compatibility", required: false },
            },
          ],
        },
        {
          kind: "interface",
          name: "model",
          description: null,
          fields: [],
        },
        {
          kind: "input",
          name: "compatibility",
          description: null,
          unknownKeys: "preserve",
          fields: [],
        },
        {
          kind: "object",
          name: "module0",
          description: null,
          fields: [
            {
              key: "node",
              name: "node",
              description: null,
              deprecated: null,
              type: { kind: "named", name: "class", required: false },
            },
          ],
        },
      ],
      state: {
        global: {
          root: { kind: "named", name: "module0", required: true },
          initialValue: {},
          examples: [],
        },
        local: { root: null, initialValue: {}, examples: [] },
      },
    };

    const source = renderCodeFirstDocumentModelFamily({
      ...request,
      definition: hazardous as unknown as DocumentModelDefinitionV1,
    });
    expect(source).not.toMatch(
      /const (?:class|ph|model|module0|compatibility): (?:Enum|Input|Interface|Object|Union)Descriptor/,
    );
    expect(source).toContain(
      'const _type0: UnionDescriptor = ph.union("class"',
    );
    expect(source).toContain("members: [_type1]");
    expect(source).toContain("implements: [_type2]");
    expect(source).toContain("ph.ref(() => _type3)");
    expect(source).toContain("schema: _type4");
    expect(source.indexOf("const _type2:")).toBeLessThan(
      source.indexOf("const _type1:"),
    );
    expect(source.indexOf("const _type1:")).toBeLessThan(
      source.indexOf("const _type0:"),
    );
  });

  it("infers the exact generated reducer-map export", () => {
    expect(
      inferLegacyReducerBindings({
        definition,
        legacyImportBase: "../legacy",
      }),
    ).toEqual([
      expect.objectContaining({ exportName: "OperationsOperations" }),
    ]);
  });
});
