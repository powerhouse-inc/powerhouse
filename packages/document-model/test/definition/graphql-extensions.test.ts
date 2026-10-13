import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { schemaFirstSpecification } from "../../src/definition/compatibility.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { checkRetainedSerialization } from "../../src/definition/tooling/retained-serialization.js";
import { schemaFirstGraphQLDocument } from "../../src/definition/tooling/graphql-document.js";
import type { ObjectFields } from "../../src/definition/types.js";

const PATH = ["specifications", "graphQLCompatibility"];

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  return [];
}

function probeModel(options: {
  readonly sdl: readonly string[];
  readonly values: readonly ["OPEN", ...string[]];
}) {
  const ProbeStatus = ph.enum("ProbeStatus", { values: options.values });
  const document = defineDocumentModel({
    id: "test/graphql-extension",
    name: "Probe",
    description: "",
    extension: "probe",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      graphQLCompatibility: schemaFirstGraphQLDocument(options.sdl),
      global: {
        schema: ph.object("ProbeState", {
          fields: { status: ph.ref(ProbeStatus, { required: true }) },
        }),
        initialValue: { status: "OPEN" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const statuses = document.module("statuses", {
    operations: ({ global }) => ({
      setStatus: global({
        input: ph.input({
          fields: { status: ph.ref(ProbeStatus, { required: true }) },
        }),
        reduce(state, input) {
          state.status = input.status;
        },
      }),
    }),
  });
  return document.finalize({ modules: [statuses] });
}

const ENUM_SDL = [
  "enum ProbeStatus { OPEN }",
  "extend enum ProbeStatus { CLOSED }",
  "type ProbeState { status: ProbeStatus! }",
  "input SetStatusInput { status: ProbeStatus! }",
];

describe("an enum extension", () => {
  it("validates the values the extension adds, in state and in input", () => {
    const model = probeModel({ sdl: ENUM_SDL, values: ["OPEN", "CLOSED"] });
    const stateVerdict = (status: string) =>
      model.utils.isStateOfType(
        model.utils.createState({ global: { status } as never }),
      );
    const inputVerdict = (status: string) => {
      try {
        model.actions.setStatus({ status } as never);
        return true;
      } catch {
        return false;
      }
    };
    expect(
      ["OPEN", "CLOSED", "BOGUS"].map((status) => [
        status,
        stateVerdict(status),
        inputVerdict(status),
      ]),
    ).toStrictEqual([
      ["OPEN", true, true],
      ["CLOSED", true, true],
      ["BOGUS", false, false],
    ]);
  });

  it("rejects descriptors that declare only the base values, naming the extension", () => {
    const diagnostics = diagnosticsOf(() =>
      probeModel({ sdl: ENUM_SDL, values: ["OPEN"] }),
    );
    expect(
      diagnostics.map(({ code, path, message, repair }) => ({
        code,
        path,
        message,
        repair,
      })),
    ).toStrictEqual([
      {
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: [...PATH, "document", "definitions", 1, "values", "CLOSED"],
        message:
          'ProbeStatus.CLOSED is added by "extend enum ProbeStatus" and missing from the descriptors.',
        repair: 'Add "CLOSED" to the values of ph.enum("ProbeStatus").',
      },
    ]);
  });

  it("applies an extension that precedes its base definition", () => {
    const reordered = probeModel({
      sdl: [
        "extend enum ProbeStatus { CLOSED }",
        "enum ProbeStatus { OPEN }",
        "type ProbeState { status: ProbeStatus! }",
        "input SetStatusInput { status: ProbeStatus! }",
      ],
      values: ["OPEN", "CLOSED"],
    });
    expect(
      reordered.utils.isStateOfType(
        reordered.utils.createState({ global: { status: "CLOSED" } }),
      ),
    ).toBe(true);
  });

  it("applies every extension of one type", () => {
    expect(
      diagnosticsOf(() =>
        probeModel({
          sdl: [
            "enum ProbeStatus { OPEN }",
            "extend enum ProbeStatus { CLOSED }",
            "extend enum ProbeStatus { ARCHIVED }",
            "type ProbeState { status: ProbeStatus! }",
            "input SetStatusInput { status: ProbeStatus! }",
          ],
          values: ["OPEN", "ARCHIVED", "CLOSED"],
        }),
      ),
    ).toStrictEqual([]);
  });

  it("reads a bare @deprecated on an extension value as the default reason", () => {
    const ProbeStatus = ph.enum("ProbeStatus", {
      values: [
        "OPEN",
        { name: "CLOSED", deprecated: "No longer supported" },
      ] as const,
    });
    expect(
      diagnosticsOf(() =>
        defineDocumentModel({
          id: "test/graphql-extension",
          name: "Probe",
          description: "",
          extension: "probe",
          version: 1,
          author: { name: "Powerhouse" },
          specifications: {
            graphQLCompatibility: schemaFirstGraphQLDocument([
              "enum ProbeStatus { OPEN }",
              "extend enum ProbeStatus { CLOSED @deprecated }",
              "type ProbeState { status: ProbeStatus! }",
            ]),
            global: {
              schema: ph.object("ProbeState", {
                fields: { status: ph.ref(ProbeStatus, { required: true }) },
              }),
              initialValue: { status: "OPEN" },
            },
            local: { schema: null, initialValue: {} },
          },
        }).finalize({ modules: [] }),
      ),
    ).toStrictEqual([]);
  });
});

function objectModel(options: {
  readonly sdl: readonly string[];
  readonly withExtensionFields: boolean;
}) {
  const stateFields: ObjectFields = options.withExtensionFields
    ? { title: ph.String({ required: true }), extra: ph.Int() }
    : { title: ph.String({ required: true }) };
  const inputFields: ObjectFields = options.withExtensionFields
    ? { title: ph.String({ required: true }), note: ph.String() }
    : { title: ph.String({ required: true }) };
  const document = defineDocumentModel({
    id: "test/graphql-object-extension",
    name: "Obj",
    description: "",
    extension: "obj",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      graphQLCompatibility: schemaFirstGraphQLDocument(options.sdl),
      global: {
        schema: ph.object("ObjState", { fields: stateFields }),
        initialValue: options.withExtensionFields
          ? { title: "", extra: null }
          : { title: "" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const titles = document.module("titles", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({ fields: inputFields }),
        reduce() {},
      }),
    }),
  });
  return document.finalize({ modules: [titles] });
}

const OBJECT_SDL = [
  "type ObjState { title: String! }",
  "extend type ObjState { extra: Int }",
  "input SetTitleInput { title: String! }",
  "extend input SetTitleInput { note: String }",
];

describe("object and input extensions", () => {
  it("validates the fields the extensions add", () => {
    const model = objectModel({ sdl: OBJECT_SDL, withExtensionFields: true });
    const stateVerdict = (extra: unknown) =>
      model.utils.isStateOfType(
        model.utils.createState({ global: { title: "t", extra } as never }),
      );
    const inputVerdict = (note: unknown) => {
      try {
        model.actions.setTitle({ title: "t", note } as never);
        return true;
      } catch {
        return false;
      }
    };
    expect([1, null, "x"].map(stateVerdict)).toStrictEqual([true, true, false]);
    expect(["a", null, undefined, 42].map(inputVerdict)).toStrictEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it("rejects descriptors that omit the extension fields", () => {
    expect(
      diagnosticsOf(() =>
        objectModel({ sdl: OBJECT_SDL, withExtensionFields: false }),
      ).map(({ path, message }) => ({ path, message })),
    ).toStrictEqual([
      {
        path: [...PATH, "document", "definitions", 1, "fields", "extra"],
        message:
          'ObjState.extra is added by "extend type ObjState" and missing from the descriptors.',
      },
      {
        path: [...PATH, "document", "definitions", 3, "fields", "note"],
        message:
          'SetTitleInput.note is added by "extend input SetTitleInput" and missing from the descriptors.',
      },
    ]);
  });

  it("keeps reporting a real conflict on an extension field", () => {
    const diagnostics = diagnosticsOf(() =>
      objectModel({
        sdl: [
          "type ObjState { title: String! }",
          "extend type ObjState { extra: Float }",
          "input SetTitleInput { title: String! }",
          "extend input SetTitleInput { note: String }",
        ],
        withExtensionFields: true,
      }),
    );
    expect(
      diagnostics.map(({ path, expected, received }) => ({
        path,
        expected,
        received,
      })),
    ).toStrictEqual([
      {
        path: [
          ...PATH,
          "document",
          "definitions",
          1,
          "fields",
          "extra",
          "type",
        ],
        expected: "Int",
        received: "Float",
      },
    ]);
  });

  it("treats an extension without a base definition as the definition", () => {
    expect(
      diagnosticsOf(() =>
        objectModel({
          sdl: [
            "extend type ObjState { title: String! }",
            "extend type ObjState { extra: Int }",
            "input SetTitleInput { title: String! }",
            "extend input SetTitleInput { note: String }",
          ],
          withExtensionFields: true,
        }),
      ),
    ).toStrictEqual([]);
  });

  it("rejects an extension of a different kind, as the host does", () => {
    const diagnostics = diagnosticsOf(() =>
      objectModel({
        sdl: [...OBJECT_SDL, "extend enum ObjState { EXTRA }"],
        withExtensionFields: true,
      }),
    );
    expect(
      diagnostics.map(({ path, message, expected, received }) => ({
        path,
        message,
        expected,
        received,
      })),
    ).toStrictEqual([
      {
        path: [...PATH, "document", "definitions", 4],
        message:
          "ObjState is an object type, so it cannot be extended as an enum.",
        expected: "ObjectTypeExtension",
        received: "EnumTypeExtension",
      },
    ]);
  });

  it("rejects a member that an extension defines again, as the host does", () => {
    const diagnostics = diagnosticsOf(() =>
      objectModel({
        sdl: [...OBJECT_SDL, "extend type ObjState { title: String! }"],
        withExtensionFields: true,
      }),
    );
    expect(
      diagnostics.map(({ path, message, related }) => ({
        path,
        message,
        related,
      })),
    ).toStrictEqual([
      {
        path: [...PATH, "document", "definitions", 4, "fields", "title"],
        message: "ObjState.title is defined more than once.",
        related: [
          {
            path: [...PATH, "document", "definitions", 0, "fields", "title"],
            message: "ObjState.title is first defined here.",
          },
        ],
      },
    ]);
  });

  it("adds no members for a directive-only extension", () => {
    expect(
      diagnosticsOf(() =>
        objectModel({
          sdl: [
            "directive @audited on OBJECT",
            ...OBJECT_SDL,
            "extend type ObjState @audited",
          ],
          withExtensionFields: true,
        }),
      ),
    ).toStrictEqual([]);
  });
});

describe("a union extension", () => {
  function unionModel(
    sdl: readonly string[],
    compatibility?: ReturnType<typeof schemaFirstSpecification>,
  ) {
    const Cat = ph.object("Cat", { fields: { meows: ph.Boolean() } });
    const Dog = ph.object("Dog", { fields: { barks: ph.Boolean() } });
    const Pet = ph.union("Pet", { members: [Cat, Dog] });
    return defineDocumentModel({
      id: "test/graphql-union-extension",
      name: "Pets",
      description: "",
      extension: "pets",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        graphQLCompatibility: schemaFirstGraphQLDocument(sdl),
        global: {
          schema: ph.object("PetsState", {
            fields: { pet: ph.ref(Pet) },
          }),
          initialValue: { pet: null },
        },
        local: { schema: null, initialValue: {} },
      },
    }).finalize({ modules: [], ...(compatibility && { compatibility }) });
  }

  it("passes the retained-serialization check with members in another order", () => {
    const sdl = [
      "type PetsState { pet: Pet }",
      "type Cat { meows: Boolean }",
      "type Dog { barks: Boolean }",
      "union Pet = Dog",
      "extend union Pet = Cat",
    ].join("\n");
    const model = unionModel(
      [sdl],
      schemaFirstSpecification({
        serialization: { "state/global/schema": sdl },
      }),
    );
    expect(
      checkRetainedSerialization({
        definition: model.definition,
        documentModel: model.documentModel,
      }),
    ).toStrictEqual([]);
  });

  it("adds members, compared regardless of order", () => {
    const base = [
      "type PetsState { pet: Pet }",
      "type Cat { meows: Boolean }",
      "type Dog { barks: Boolean }",
    ];
    expect(
      diagnosticsOf(() =>
        unionModel([...base, "union Pet = Dog", "extend union Pet = Cat"]),
      ),
    ).toStrictEqual([]);
    const model = unionModel([
      ...base,
      "union Pet = Cat",
      "extend union Pet = Dog",
    ]);
    expect(
      model.utils.isStateOfType(
        model.utils.createState({ global: { pet: { barks: true } } }),
      ),
    ).toBe(true);
  });
});

describe("interface and implements extensions", () => {
  function namedModel(sdl: readonly string[]) {
    const Named = ph.interface("Named", {
      fields: { name: ph.String({ required: true }), tag: ph.String() },
    });
    const Pet = ph.object("Pet", {
      implements: [Named],
      fields: { name: ph.String({ required: true }), tag: ph.String() },
    });
    return defineDocumentModel({
      id: "test/graphql-interface-extension",
      name: "Named",
      description: "",
      extension: "named",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        graphQLCompatibility: schemaFirstGraphQLDocument(sdl),
        global: {
          schema: ph.object("NamedState", {
            fields: { pet: ph.ref(Pet, { required: true }) },
          }),
          initialValue: { pet: { name: "", tag: null } },
        },
        local: { schema: null, initialValue: {} },
      },
    }).finalize({ modules: [] });
  }

  it("accepts an interface field and an implemented interface added by extensions", () => {
    const model = namedModel([
      "type NamedState { pet: Pet! }",
      "interface Named { name: String! }",
      "extend interface Named { tag: String }",
      "type Pet { name: String! tag: String }",
      "extend type Pet implements Named",
    ]);
    const verdict = (tag: unknown) =>
      model.utils.isStateOfType(
        model.utils.createState({
          global: { pet: { name: "n", tag } } as never,
        }),
      );
    expect([verdict("t"), verdict(null), verdict(7)]).toStrictEqual([
      true,
      true,
      false,
    ]);
  });

  it("rejects descriptors that miss an interface an extension adds", () => {
    const diagnostics = diagnosticsOf(() =>
      namedModel([
        "type NamedState { pet: Pet! }",
        "interface Named { name: String! }",
        "extend interface Named { tag: String }",
        "interface Tagged { tag: String }",
        "type Pet { name: String! tag: String }",
        "extend type Pet implements Named & Tagged",
      ]),
    );
    expect(
      diagnostics.map(({ path, expected, received }) => ({
        path,
        expected,
        received,
      })),
    ).toStrictEqual([
      {
        path: [...PATH, "document", "Pet", "implements"],
        expected: "Named",
        received: "Named & Tagged",
      },
      {
        path: [...PATH, "document", "Tagged"],
        expected: "a descriptor for every named type in the AST",
        received: "InterfaceTypeDefinition",
      },
    ]);
  });
});

describe("scalar extensions", () => {
  function leafModel(sdl: readonly string[]) {
    return defineDocumentModel({
      id: "test/graphql-scalar-extension",
      name: "Leaf",
      description: "",
      extension: "leaf",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        graphQLCompatibility: schemaFirstGraphQLDocument(sdl),
        global: {
          schema: ph.object("LeafState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    }).finalize({ modules: [] });
  }

  it("rejects a type extension of a scalar and a scalar extension of a type, as the host does", () => {
    const messages = (sdl: readonly string[]) =>
      diagnosticsOf(() => leafModel(sdl)).map(({ path, message }) => ({
        path,
        message,
      }));
    expect(
      messages([
        "type LeafState { title: String! }",
        "scalar Leaf",
        "extend type Leaf { value: String! }",
      ]),
    ).toStrictEqual([
      {
        path: [...PATH, "document", "definitions", 2],
        message:
          "Leaf is a scalar, so it cannot be extended as an object type.",
      },
    ]);
    expect(
      messages([
        "directive @tag on SCALAR",
        "type LeafState { title: String! }",
        "extend scalar LeafState @tag",
      ]),
    ).toStrictEqual([
      {
        path: [...PATH, "document", "definitions", 2],
        message:
          "LeafState is an object type, so it cannot be extended as a scalar.",
      },
    ]);
  });

  it("rejects a scalar extension of a type only extensions define, in either order", () => {
    const sdl = [
      "directive @tag on SCALAR",
      "type LeafState { title: String! }",
    ];
    const scalarExtension = "extend scalar Leaf @tag";
    const typeExtension = "extend type Leaf { value: String! }";
    const messages = (order: readonly string[]) =>
      diagnosticsOf(() => leafModel([...sdl, ...order])).map(
        ({ message }) => message,
      );
    expect(messages([scalarExtension, typeExtension])).toContain(
      "Leaf is an object type, so it cannot be extended as a scalar.",
    );
    expect(messages([typeExtension, scalarExtension])).toContain(
      "Leaf is an object type, so it cannot be extended as a scalar.",
    );
  });

  it("passes a scalar extension of a scalar through", () => {
    expect(
      diagnosticsOf(() =>
        leafModel([
          "directive @tag on SCALAR",
          "type LeafState { title: String! }",
          "scalar Leaf",
          "extend scalar Leaf @tag",
        ]),
      ),
    ).toStrictEqual([]);
  });
});
