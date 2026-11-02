import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import { diagnosticsOf } from "../helpers/diagnostics.js";

const GoodState = ph.object("SampleState", {
  fields: { title: ph.String({ required: true }) },
});

function declare(scopes: unknown) {
  return () =>
    defineDocumentModel({
      id: "test/sample",
      name: "Sample",
      description: "",
      extension: "sample",
      version: 1,
      author: { name: "Powerhouse" },
      scopes,
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
        path: ["scopes", "global", "schema"],
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
      path: ["scopes", "local", "schema"],
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
      scopes: {
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
    const materialized = materialize(model.version({ modules: [] }));
    expect(materialized.definition.model.graphQLName).toBe("MultiWordModel");
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
    scopes: {
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
    const specification = materialize(emptyLocalModel.version({ modules: [] }))
      .definition.specifications[0];
    expect(specification.state.local).toMatchObject({
      root: null,
      initialValue: {},
      materialized: { schema: "", initialValue: "{}" },
    });
  });

  it("keeps empty-local examples", () => {
    const specification = materialize(emptyLocalModel.version({ modules: [] }))
      .definition.specifications[0];
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
        path: ["scopes", "local", "initialValue"],
      });
      expect(diagnostics[0]?.repair).toContain("initialValue: {}");
    });
  }
});

describe("defineDocumentModel initial values", () => {
  for (const scope of ["global", "local"] as const) {
    const State = ph.object("SampleState", {
      fields: { title: ph.String({ required: true }), payload: ph.Unknown() },
    });
    const LocalState = ph.object("SampleLocalState", {
      fields: { title: ph.String({ required: true }), payload: ph.Unknown() },
    });
    const scopes = (initialValue: unknown) => ({
      global: { schema: State, initialValue: { title: "global" } },
      local: { schema: LocalState, initialValue: { title: "local" } },
      [scope]: {
        schema: scope === "global" ? State : LocalState,
        initialValue,
      },
    });

    it(`rejects a ${scope} getter at its member path without invoking it`, () => {
      let reads = 0;
      const initialValue = {
        get title() {
          reads += 1;
          return "hi";
        },
      };
      const diagnostics = diagnosticsOf(() =>
        declare(scopes(initialValue))().version({ modules: [] }),
      );
      expect(reads).toBe(0);
      expect(diagnostics[0]).toMatchObject({
        code: "PH-DM-INITIAL-VALUE-INVALID",
        path: ["scopes", scope, "initialValue", "title"],
        received: "accessor",
      });
    });

    const invalidMembers: readonly {
      readonly label: string;
      readonly payload: unknown;
      readonly path: readonly (string | number)[];
      readonly received: string;
    }[] = [
      {
        label: "a symbol key",
        payload: { [Symbol("tag")]: "hidden" },
        path: ["payload"],
        received: "symbol-key",
      },
      {
        label: "a function",
        payload: { run: () => "hi" },
        path: ["payload", "run"],
        received: "function",
      },
      {
        label: "a symbol value",
        payload: { tag: Symbol("tag") },
        path: ["payload", "tag"],
        received: "symbol",
      },
      {
        label: "a non-enumerable member",
        payload: Object.defineProperty({}, "hidden", { value: "hi" }),
        path: ["payload", "hidden"],
        received: "non-enumerable",
      },
    ];
    for (const { label, payload, path, received } of invalidMembers) {
      it(`rejects ${label} in ${scope} initialValue at its own path`, () => {
        const diagnostics = diagnosticsOf(() =>
          declare(scopes({ title: "hi", payload }))().version({
            modules: [],
          }),
        );
        expect(diagnostics[0]).toMatchObject({
          code: "PH-DM-INITIAL-VALUE-INVALID",
          path: ["scopes", scope, "initialValue", ...path],
          received,
        });
      });
    }

    for (const container of ["object", "array"] as const) {
      it(`rejects a nested ${container} getter in ${scope} initialValue without invoking it`, () => {
        let reads = 0;
        const payload = container === "array" ? ["hi"] : { title: "hi" };
        const key = container === "array" ? 0 : "title";
        Object.defineProperty(payload, key, {
          enumerable: true,
          get() {
            reads += 1;
            return "hi";
          },
        });
        const diagnostics = diagnosticsOf(() =>
          declare(scopes({ title: "hi", payload }))().version({
            modules: [],
          }),
        );
        expect(reads).toBe(0);
        expect(diagnostics[0]).toMatchObject({
          code: "PH-DM-INITIAL-VALUE-INVALID",
          path: ["scopes", scope, "initialValue", "payload", key],
          received: "accessor",
        });
      });
    }

    it(`copies plain ${scope} data before later author mutations`, () => {
      const item = { count: 1 };
      const initialValue = {
        title: "initial",
        payload: { note: "original", items: [item] },
      };
      const model = declare(scopes(initialValue))();
      initialValue.title = "changed";
      initialValue.payload.note = "changed";
      item.count = 2;
      initialValue.payload.items.push({ count: 3 });
      const state = materialize(model.version({ modules: [] })).definition
        .specifications[0].state[scope];
      expect(state.initialValue).toStrictEqual({
        title: "initial",
        payload: { note: "original", items: [{ count: 1 }] },
      });
      expect(state.materialized.initialValue).toBe(
        '{"title":"initial","payload":{"note":"original","items":[{"count":1}]}}',
      );
    });
  }

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
        scopes: {
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
    const JsonRecord = defineScalar({
      name: "JsonRecord",
      description: "A JSON object of strings.",
      schema: z.record(z.string(), z.string()),
    });
    const State = ph.object("JsonState", {
      fields: {
        dropped: ph.Unknown(),
        nonFinite: ph.Float(),
        serialized: ph.scalar(JsonRecord),
        nested: ph.list(ph.String()),
      },
    });
    const value = {
      dropped: undefined,
      nonFinite: Number.NaN,
      serialized: { from: "plain data" },
      nested: ["a", undefined],
    };
    const model = defineDocumentModel({
      id: "test/json",
      name: "Json",
      description: "",
      extension: "json",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: State,
          initialValue: value as never,
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const specification = materialize(model.version({ modules: [] })).definition
      .specifications[0];
    expect(specification.state.global.materialized.initialValue).toBe(
      JSON.stringify(value),
    );
    expect(specification.state.global.materialized.initialValue).toBe(
      '{"nonFinite":null,"serialized":{"from":"plain data"},"nested":["a",null]}',
    );
    expect(specification.state.global.initialValue).toStrictEqual({
      nonFinite: null,
      serialized: { from: "plain data" },
      nested: ["a", null],
    });
  });

  it("rejects toJSON without invoking author code", () => {
    let calls = 0;
    const diagnostics = diagnosticsOf(() =>
      declare({
        global: {
          schema: GoodState,
          initialValue: {
            title: "hi",
            toJSON() {
              calls += 1;
              return { title: "serialized" };
            },
          },
        },
        local: { schema: null, initialValue: {} },
      })().version({ modules: [] }),
    );
    expect(calls).toBe(0);
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      path: ["scopes", "global", "initialValue", "toJSON"],
      received: "function",
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
      scopes: {
        global: {
          schema: ph.object("InvalidInitialState", {
            fields: { count: ph.Int({ required: true }) },
          }),
          initialValue: { count: "not a number" as never },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const diagnostics = diagnosticsOf(() =>
      materialize(model.version({ modules: [] })),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      path: ["scopes", "global", "initialValue"],
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
        scopes: {
          global: {
            schema: ph.object("CyclicState", {
              fields: { self: ph.Unknown() },
            }),
            initialValue: cyclic as never,
          },
          local: { schema: null, initialValue: {} },
        },
      }).version({ modules: [] }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-INITIAL-VALUE-INVALID",
      path: ["scopes", "global", "initialValue", "self"],
      received: "cycle",
    });
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
      path: ["scopes", "platform"],
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
        scopes: {
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

  it("rejects an auth declaration inside scopes", () => {
    const diagnostics = diagnosticsOf(
      declare({
        auth: { required: true },
        global: { schema: GoodState, initialValue: { title: "" } },
        local: { schema: null, initialValue: {} },
      }),
    );
    expect(diagnostics[0]?.code).toBe("PH-AUTH-UNSUPPORTED");
  });

  it("reports auth and a custom scope inside scopes in either order", () => {
    const scopes = {
      global: { schema: GoodState, initialValue: { title: "" } },
      local: { schema: null, initialValue: {} },
    };
    const reported = (value: unknown) =>
      diagnosticsOf(declare(value)).map((entry) => [
        entry.code,
        entry.path.join("."),
      ]);
    const both = [
      ["PH-AUTH-UNSUPPORTED", "scopes.auth"],
      ["PH-DM-SCOPE-UNSUPPORTED", "scopes.custom"],
    ];

    expect(reported({ auth: {}, custom: {}, ...scopes })).toEqual(both);
    expect(reported({ custom: {}, auth: {}, ...scopes })).toEqual(both);
  });

  it("reports auth once, unread, whether it is an accessor or non-enumerable", () => {
    const scopes = {
      global: { schema: GoodState, initialValue: { title: "" } },
      local: { schema: null, initialValue: {} },
    };
    let ran = false;
    const withAuth = (
      descriptor: PropertyDescriptor,
      before: object = {},
      after: object = {},
    ) => {
      const value = { ...before };
      Object.defineProperty(value, "auth", {
        configurable: true,
        ...descriptor,
      });
      return Object.assign(value, after);
    };
    const accessor = {
      enumerable: true,
      get() {
        ran = true;
        return {};
      },
    };
    const hidden = { enumerable: false, value: {} };
    const reported = (run: () => unknown) =>
      diagnosticsOf(run).map((entry) => [entry.code, entry.path.join(".")]);
    const auth = ["PH-AUTH-UNSUPPORTED", "scopes.auth"];
    const custom = ["PH-DM-SCOPE-UNSUPPORTED", "scopes.custom"];

    expect([
      reported(declare(withAuth(accessor, {}, scopes))),
      reported(declare(withAuth(hidden, {}, scopes))),
      reported(declare(withAuth(accessor, {}, { custom: {}, ...scopes }))),
      reported(declare(withAuth(accessor, { custom: {} }, scopes))),
      reported(() =>
        defineDocumentModel(
          withAuth(accessor, {
            id: "test/auth-accessor",
            name: "AuthAccessor",
            description: "",
            extension: "auth",
            version: 1,
            author: { name: "Powerhouse" },
            scopes,
          }) as never,
        ),
      ),
    ]).toEqual([
      [auth],
      [auth],
      [auth, custom],
      [auth, custom],
      [["PH-AUTH-UNSUPPORTED", "auth"]],
    ]);
    expect(ran).toBe(false);
  });

  it("reports a model auth declaration once", () => {
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/auth-once",
        name: "AuthOnce",
        description: "",
        extension: "auth",
        version: 1,
        author: { name: "Powerhouse" },
        auth: { required: true },
        scopes: {
          global: { schema: GoodState, initialValue: { title: "" } },
          local: { schema: null, initialValue: {} },
        },
      } as never),
    );
    expect(
      diagnostics.map((entry) => [entry.code, entry.path.join(".")]),
    ).toEqual([["PH-AUTH-UNSUPPORTED", "auth"]]);
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
        scopes: {
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
          scopes: {
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
        scopes: {
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
      scopes: {
        global: {
          schema: ph.object("OpaqueState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    expect(Object.keys(model)).toStrictEqual(["module", "version"]);
    expect(JSON.stringify(model)).toBe("{}");
  });
});
