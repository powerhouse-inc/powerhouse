import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { emitDeclaration } from "./helpers/declaration-emit.js";

const GoodState = ph.object("SampleState", {
  fields: { title: ph.String({ required: true }) },
});

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a DocumentModelDefinitionError");
}

/** A declaration whose scopes the caller replaces, with checking bypassed. */
function declare(specifications: unknown): () => unknown {
  return () =>
    defineDocumentModel({
      id: "test/sample",
      name: "Sample",
      description: "",
      extension: "sample",
      version: 1,
      author: { name: "Powerhouse" },
      specifications,
    } as never);
}

describe("defineDocumentModel state roots", () => {
  const cases: readonly (readonly [string, unknown])[] = [
    ["an absent global root", undefined],
    ["an input root", ph.input("SampleStateInput", { fields: {} })],
    ["an enum root", ph.enum("SampleStateEnum", { values: ["A"] })],
    [
      "a union root",
      ph.union("SampleStateUnion", {
        members: [ph.object("Member", { fields: { id: ph.OID() } })],
      }),
    ],
    ["a field use as root", ph.String()],
    ["a wrongly named object root", ph.object("Wrong", { fields: {} })],
  ];

  for (const [label, schema] of cases) {
    it(`rejects ${label} with PH-DM-STATE-ROOT-INVALID`, () => {
      const diagnostics = diagnosticsOf(
        declare({
          global: { schema, initialValue: {} },
          local: { schema: null, initialValue: {} },
        }),
      );
      expect(diagnostics[0]).toMatchObject({
        code: "PH-DM-STATE-ROOT-INVALID",
        path: ["specifications", "global", "schema"],
      });
      expect(diagnostics[0]?.expected).toContain('ph.object("SampleState"');
    });
  }

  it("rejects a wrongly named local root", () => {
    const diagnostics = diagnosticsOf(
      declare({
        global: { schema: GoodState, initialValue: { title: "" } },
        local: {
          schema: ph.object("SampleLocal", { fields: {} }),
          initialValue: {},
        },
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-STATE-ROOT-INVALID",
      path: ["specifications", "local", "schema"],
    });
    expect(diagnostics[0]?.expected).toContain("SampleLocalState");
  });

  it("derives both root names from the model name", () => {
    const model = defineDocumentModel({
      id: "test/multi word",
      name: "multi word model",
      description: "",
      extension: "mw",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("MultiWordModelState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: {
          schema: ph.object("MultiWordModelLocalState", {
            fields: { note: ph.String() },
          }),
          initialValue: { note: null },
        },
      },
    });
    const finalized = model.finalize({ modules: [] });
    expect(finalized.definition.model.graphQLName).toBe("MultiWordModel");
  });
});

describe("defineDocumentModel empty local state", () => {
  const emptyLocalModel = defineDocumentModel({
    id: "test/empty-local",
    name: "EmptyLocal",
    description: "",
    extension: "el",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ph.object("EmptyLocalState", {
          fields: { title: ph.String({ required: true }) },
        }),
        initialValue: { title: "" },
      },
      local: {
        schema: null,
        initialValue: {},
        examples: [{ key: "empty", value: "{}" }],
      },
    },
  });

  it("materializes an empty schema and an empty object", () => {
    const specification = emptyLocalModel.finalize({ modules: [] }).definition
      .specifications[0];
    expect(specification.state.local).toMatchObject({
      root: null,
      initialValue: {},
      materialized: { schema: "", initialValue: "{}" },
    });
  });

  it("keeps empty-local examples", () => {
    const specification = emptyLocalModel.finalize({ modules: [] }).definition
      .specifications[0];
    expect(specification.state.local.examples).toHaveLength(1);
    expect(specification.state.local.examples[0]).toMatchObject({
      key: "empty",
      value: "{}",
    });
    expect(
      specification.state.local.materialized.examples[0],
    ).not.toHaveProperty("key");
  });

  const rejected: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["an array", []],
    ["a string", "{}"],
    ["a number", 0],
    ["a nonempty object", { note: null }],
    ["a custom prototype", Object.create({ note: null }) as unknown],
  ];

  for (const [label, initialValue] of rejected) {
    it(`rejects ${label} as an empty-local initial value`, () => {
      const diagnostics = diagnosticsOf(
        declare({
          global: { schema: GoodState, initialValue: { title: "" } },
          local: { schema: null, initialValue },
        }),
      );
      expect(diagnostics[0]).toMatchObject({
        code: "PH-DM-INITIAL-VALUE-INVALID",
        path: ["specifications", "local", "initialValue"],
      });
      expect(diagnostics[0]?.repair).toContain("initialValue: {}");
    });
  }
});

describe("defineDocumentModel initial values", () => {
  it("contextually types initialValue against the sibling schema", () => {
    const State = ph.object("TypedState", {
      fields: {
        title: ph.String({ required: true }),
        note: ph.String(),
      },
    });
    const build = () =>
      defineDocumentModel({
        id: "test/typed",
        name: "Typed",
        description: "",
        extension: "typed",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          global: {
            schema: State,
            // @ts-expect-error a missing required field fails TypeScript
            initialValue: { note: null },
          },
          local: { schema: null, initialValue: {} },
        },
      });
    expect(typeof build).toBe("function");
  });

  it("materializes with the platform's JSON.stringify behavior", () => {
    const State = ph.object("JsonState", {
      fields: {
        // `Unknown` is the one document position that accepts an absent key,
        // in both the generated and the compiled validator.
        dropped: ph.Unknown(),
        nonFinite: ph.Float(),
        serialized: ph.JSONObject(),
        nested: ph.list(ph.String()),
      },
    });
    const value = {
      dropped: undefined,
      nonFinite: Number.NaN,
      serialized: {
        toJSON() {
          return { from: "toJSON" };
        },
      },
      nested: ["a", undefined],
    };
    const specification = defineDocumentModel({
      id: "test/json",
      name: "Json",
      description: "",
      extension: "json",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: State,
          initialValue: value as never,
        },
        local: { schema: null, initialValue: {} },
      },
    }).finalize({ modules: [] }).definition.specifications[0];
    // The same bytes the schema-first path stores for this value.
    expect(specification.state.global.materialized.initialValue).toBe(
      JSON.stringify(value),
    );
    expect(specification.state.global.materialized.initialValue).toBe(
      '{"nonFinite":null,"serialized":{"from":"toJSON"},"nested":["a",null]}',
    );
    expect(specification.state.global.initialValue).toStrictEqual({
      nonFinite: null,
      serialized: { from: "toJSON" },
      nested: ["a", null],
    });
  });

  it("rejects an initial value its own validator rejects", () => {
    const model = defineDocumentModel({
      id: "test/invalid-initial",
      name: "InvalidInitial",
      description: "",
      extension: "ii",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("InvalidInitialState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: "not a number" as never },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const diagnostics = diagnosticsOf(() => model.finalize({ modules: [] }));
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      path: ["specifications", "global", "initialValue"],
    });
    expect(diagnostics[0]?.message).toContain("InvalidInitialState");
  });

  it("rejects a value JSON.stringify cannot serialize", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/cyclic",
        name: "Cyclic",
        description: "",
        extension: "cy",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          global: {
            schema: ph.object("CyclicState", {
              fields: { self: ph.Unknown() },
            }),
            initialValue: cyclic as never,
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] }),
    );
    expect(diagnostics[0]?.code).toBe("PH-DM-INITIAL-VALUE-INVALID");
    expect(diagnostics[0]?.message).toContain("stored JSON string");
  });
});

describe("defineDocumentModel scopes and authorization", () => {
  it("rejects an authored scope outside global and local", () => {
    const diagnostics = diagnosticsOf(
      declare({
        global: { schema: GoodState, initialValue: { title: "" } },
        local: { schema: null, initialValue: {} },
        platform: { schema: null, initialValue: {} },
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-SCOPE-UNSUPPORTED",
      path: ["specifications", "platform"],
    });
    expect(diagnostics[0]?.repair).toContain("platform concerns");
  });

  it("rejects a model auth declaration with PH-AUTH-UNSUPPORTED", () => {
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/auth",
        name: "Auth",
        description: "",
        extension: "auth",
        version: 1,
        author: { name: "Powerhouse" },
        auth: { required: true },
        specifications: {
          global: { schema: GoodState, initialValue: { title: "" } },
          local: { schema: null, initialValue: {} },
        },
      } as never),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-AUTH-UNSUPPORTED",
      phase: "authorization",
      path: ["auth"],
    });
  });

  it("rejects an auth declaration inside specifications", () => {
    const diagnostics = diagnosticsOf(
      declare({
        auth: { required: true },
        global: { schema: GoodState, initialValue: { title: "" } },
        local: { schema: null, initialValue: {} },
      }),
    );
    expect(diagnostics[0]?.code).toBe("PH-AUTH-UNSUPPORTED");
  });

  it("rejects auth at TypeScript checking too", () => {
    const declare = () =>
      defineDocumentModel({
        id: "test/auth-typed",
        name: "AuthTyped",
        description: "",
        extension: "auth",
        version: 1,
        author: { name: "Powerhouse" },
        // @ts-expect-error auth is not part of the public declaration
        auth: { required: true },
        specifications: {
          global: {
            schema: ph.object("AuthTypedState", {
              fields: { title: ph.String({ required: true }) },
            }),
            initialValue: { title: "" },
          },
          local: { schema: null, initialValue: {} },
        },
      });
    expect(diagnosticsOf(declare)[0]?.code).toBe("PH-AUTH-UNSUPPORTED");
  });
});

describe("defineDocumentModel configuration", () => {
  it("requires a positive safe-integer version", () => {
    for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, "1"]) {
      const diagnostics = diagnosticsOf(() =>
        defineDocumentModel({
          id: "test/version",
          name: "Version",
          description: "",
          extension: "v",
          version: version as never,
          author: { name: "Powerhouse" },
          specifications: {
            global: { schema: GoodState, initialValue: { title: "" } },
            local: { schema: null, initialValue: {} },
          },
        }),
      );
      expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        "PH-DM-DECLARATION-INVALID",
      );
    }
  });

  it("collects every configuration diagnostic in one error", () => {
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "",
        name: "Sample",
        description: 4 as never,
        extension: "s",
        version: 0,
        author: { name: "Powerhouse" },
        specifications: {
          global: { schema: GoodState, initialValue: { title: "" } },
          local: { schema: null, initialValue: {} },
        },
      }),
    );
    expect(diagnostics.length).toBeGreaterThanOrEqual(3);
    expect(diagnostics.map((diagnostic) => diagnostic.path)).toStrictEqual(
      [...diagnostics]
        .map((diagnostic) => diagnostic.path)
        .sort((a, b) => (a.join("/") < b.join("/") ? -1 : 1)),
    );
  });

  it("rejects a declaration that is not a plain object", () => {
    for (const input of [null, undefined, 4, "config", [], new Date()]) {
      const diagnostics = diagnosticsOf(() =>
        defineDocumentModel(input as never),
      );
      expect(diagnostics[0]?.code, String(input)).toBe(
        "PH-DM-DECLARATION-INVALID",
      );
      expect(diagnostics[0]?.repair).toContain("plain object literal");
    }
  });

  it("keeps the context opaque", () => {
    const model = defineDocumentModel({
      id: "test/opaque",
      name: "Opaque",
      description: "",
      extension: "op",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("OpaqueState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    expect(Object.keys(model)).toStrictEqual(["module", "version", "finalize"]);
    expect(JSON.stringify(model)).toBe("{}");
  });
});

describe("the emitted declaration of a context", () => {
  it("carries no reducer callback signature", () => {
    const source = [
      'import { ph } from "../../src/definition/field.js";',
      'import { defineDocumentModel } from "../../src/definition/model.js";',
      "export const sample = defineDocumentModel({",
      '  id: "test/emitted",',
      '  name: "Emitted",',
      '  description: "",',
      '  extension: "em",',
      "  version: 1,",
      '  author: { name: "Powerhouse" },',
      "  specifications: {",
      "    global: {",
      '      schema: ph.object("EmittedState", { fields: { title: ph.String({ required: true }) } }),',
      '      initialValue: { title: "" },',
      "    },",
      "    local: { schema: null, initialValue: {} },",
      "  },",
      "});",
      'export const numbers = sample.module("numbers", {',
      "  operations: ({ global }) => ({",
      "    setTitle: global({",
      "      input: ph.input({ fields: { title: ph.String({ required: true }) } }),",
      "      reduce(state, input) {",
      "        state.title = input.title;",
      "      },",
      "    }),",
      "  }),",
      "});",
    ].join("\n");
    const { declaration, diagnostics } = emitDeclaration(source);
    expect(diagnostics).toStrictEqual([]);
    expect(declaration).toContain("DocumentModelContext");
    expect(declaration).toContain("ModelModuleToken");
    expect(declaration).not.toContain("reduce");
    expect(declaration).not.toContain("=> void");
  });
});
