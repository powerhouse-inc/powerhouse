import type {
  DefinitionDiagnostic,
  UpgradeManifest,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";
import {
  createZip,
  normalizeDocumentModelVersion,
} from "@powerhousedao/shared/document-model";
import { describe, expect, expectTypeOf, it } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import type { DocumentOf } from "../../src/definition/model.js";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
} from "../../src/definition/model.js";
import { canonicalJson } from "../../src/definition/primitives.js";
import {
  TaskFamily,
  TaskV1,
  TaskV1Definition,
  TaskV2,
  TaskV2Definition,
  taskUpgradeManifest,
  taskV1Context,
  upgradeTaskToV2,
} from "./fixtures/family-model.js";

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  throw new Error("expected a DocumentModelDefinitionError");
}

function contextAt(version: number, options: { readonly id?: string } = {}) {
  const context = defineDocumentModel({
    id: options.id ?? "test/family",
    name: "Family",
    description: "",
    extension: "fam",
    version,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ph.object("FamilyState", {
          fields: { title: ph.String({ required: true }) },
        }),
        initialValue: { title: "" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  return context.version({ modules: [] });
}

const transitionTo = (toVersion: number): UpgradeTransition => ({
  toVersion,
  upgradeReducer: (document) => document,
});

/** A manifest that agrees with `versions`, for tests about something else. */
function manifestFor(
  versions: readonly number[],
  documentType = "test/family",
): UpgradeManifest<readonly number[]> {
  return {
    documentType,
    latestVersion: versions.at(-1) ?? 1,
    supportedVersions: versions,
    upgrades: Object.fromEntries(
      versions
        .slice(1)
        .map((version) => [`v${version}`, transitionTo(version)]),
    ),
  };
}

describe("defineDocumentModelFamily", () => {
  it("publishes the complete specification history to every version", () => {
    for (const module of [TaskV1, TaskV2]) {
      expect(
        module.documentModel.global.specifications.map(
          (specification) => specification.version,
        ),
      ).toStrictEqual([1, 2]);
      expect(
        module.definition.specifications.map(
          (specification) => specification.version,
        ),
      ).toStrictEqual([1, 2]);
    }
    expect(canonicalJson(TaskV1.definition.specifications)).toBe(
      canonicalJson(TaskV2.definition.specifications),
    );
    expect(canonicalJson(TaskV1.documentModel.global.specifications)).toBe(
      canonicalJson(TaskV2.documentModel.global.specifications),
    );
    expect(TaskFamily.modules.map((module) => module.version)).toStrictEqual([
      1, 2,
    ]);
  });

  it("keeps version-specific behavior and types", () => {
    expect(Object.keys(TaskV1.actions)).not.toContain("setTitle");
    expect(Object.keys(TaskV2.actions)).toContain("setTitle");
    expectTypeOf(TaskV2.actions.setTitle).parameter(0).toMatchTypeOf<{
      title: string;
    }>();
    expect(TaskV1.utils.createState().global).toStrictEqual({ tasks: [] });
    expect(TaskV2.utils.createState().global).toStrictEqual({
      title: "",
      tasks: [],
    });
    expect(TaskV1.utils.createState().document.version).toBe(1);
    expect(TaskV2.utils.createState().document.version).toBe(2);
  });

  it("does not share stored state between versions", () => {
    const before = TaskV2.documentModel.global.name;
    TaskV1.documentModel.global.name = "mutated";
    expect(TaskV2.documentModel.global.name).toBe(before);
    TaskV1.documentModel.global.name = before;
    expect(Object.isFrozen(TaskV1.documentModel)).toBe(false);
  });

  it("fails an absent version lookup explicitly", () => {
    expect(() => TaskFamily.at(3 as never)).toThrow(RangeError);
    expect(() => TaskFamily.at(3 as never)).toThrow(/test\/task/);
  });

  it("publishes the manifest it was given, in the generated shape", () => {
    // The authored object itself, not a copy: a host registers what the
    // author wrote in `upgrades/upgrade-manifest.ts`.
    expect(TaskFamily.upgradeManifest).toBe(taskUpgradeManifest);
    // The generated shape, copied from
    // `test/versioned-documents/document-models/todo/upgrades/upgrade-manifest.ts`
    // and `upgrades/versions.ts`, which this package cannot import:
    //   { documentType, latestVersion, supportedVersions, upgrades: { v2 } }
    // with each transition `{ toVersion, upgradeReducer, description }` and no
    // frozen object anywhere.
    expect(Object.keys(TaskFamily.upgradeManifest)).toStrictEqual([
      "documentType",
      "latestVersion",
      "supportedVersions",
      "upgrades",
    ]);
    expect(Object.isFrozen(TaskFamily.upgradeManifest)).toBe(false);
    expect(Object.isFrozen(TaskFamily.upgradeManifest.upgrades)).toBe(false);
    expect(Object.isFrozen(TaskFamily.upgradeManifest.upgrades.v2)).toBe(false);
    expect(TaskFamily.upgradeManifest).toStrictEqual({
      documentType: "test/task",
      latestVersion: 2,
      supportedVersions: [1, 2],
      upgrades: {
        v2: {
          toVersion: 2,
          upgradeReducer: upgradeTaskToV2.upgradeReducer,
          description: "",
        },
      },
    });
  });

  it("upgrades both state and initialState", () => {
    const document = TaskV1.utils.createDocument();
    const withTask = TaskV1.reducer(
      document,
      TaskV1.actions.addTask({ id: "one" }),
    );
    const upgraded = TaskFamily.upgradeManifest.upgrades.v2.upgradeReducer(
      withTask,
      TaskV1.actions.addTask({ id: "ignored" }),
    ) as DocumentOf<typeof TaskV2>;
    expect(upgraded.state.global).toStrictEqual({
      title: "",
      tasks: [{ id: "one", completed: false }],
    });
    expect(upgraded.initialState.global).toStrictEqual({
      title: "",
      tasks: [],
    });
  });

  it("resolves stored versions undefined, null, and 0 to version 1", () => {
    for (const version of [undefined, null, 0]) {
      expect(normalizeDocumentModelVersion(version)).toBe(1);
    }
    const v1State = TaskV1.utils.createState();
    for (const version of [undefined, null, 0]) {
      const stamped = {
        ...v1State,
        document: { ...v1State.document, version } as never,
      };
      // The v2 module validates a v1-stamped state against the v1 schema.
      expect(TaskV2.utils.isStateOfType(stamped)).toBe(true);
    }
  });

  it("validates a stored document against the version it is stamped with", () => {
    const v1Document = TaskV1.utils.createDocument();
    expect(TaskV1.utils.isDocumentOfType(v1Document)).toBe(true);
    // v2 adds a required field, and a v1 document stays valid until upgraded.
    expect(TaskV2.utils.isDocumentOfType(v1Document)).toBe(true);
    expect(TaskV2.utils.isStateOfType(v1Document.state)).toBe(true);
    expect(() => TaskV2.utils.assertIsDocumentOfType(v1Document)).not.toThrow();
    expect(() =>
      TaskV2.utils.assertIsStateOfType(v1Document.state),
    ).not.toThrow();

    const malformedV1 = {
      ...v1Document,
      state: { ...v1Document.state, global: { tasks: "not a list" } },
      initialState: {
        ...v1Document.initialState,
        global: { tasks: "not a list" },
      },
    };
    expect(TaskV2.utils.isDocumentOfType(malformedV1)).toBe(false);
    expect(TaskV2.utils.isStateOfType(malformedV1.state)).toBe(false);
    expect(() => TaskV2.utils.assertIsDocumentOfType(malformedV1)).toThrow();

    // An unrecognized stamp falls back to the module's own schema.
    const stampedFuture = {
      ...v1Document,
      state: {
        ...v1Document.state,
        document: { ...v1Document.state.document, version: 99 },
      },
    };
    expect(TaskV2.utils.isStateOfType(stampedFuture.state)).toBe(false);
    expect(TaskV1.utils.isStateOfType(stampedFuture.state)).toBe(true);

    // initialState is validated too.
    const brokenInitial = { ...v1Document, initialState: {} as never };
    expect(TaskV2.utils.isDocumentOfType(brokenInitial)).toBe(false);
  });

  it("gives each version only its own schema and its predecessors'", () => {
    // A v1 module knows nothing about v2, so a v2-stamped state falls back to
    // v1's own schema — exactly what the generated v1 module does, because it
    // imports no v2 schema at all.
    const v1State = TaskV1.utils.createState();
    const stampedV2 = {
      ...v1State,
      document: { ...v1State.document, version: 2 },
    };
    expect(TaskV1.utils.isStateOfType(stampedV2)).toBe(true);
    expect(TaskV2.utils.isStateOfType(stampedV2)).toBe(false);
    expect(
      TaskV2.utils.isStateOfType({
        ...stampedV2,
        global: { title: "given", tasks: [] },
      }),
    ).toBe(true);
  });

  it("closes over this version's reducer and its predecessors', not the family's", async () => {
    // A document written by v2, carrying an operation only v2 declares.
    const authored = TaskV2.reducer(
      TaskV2.reducer(
        TaskV2.utils.createDocument(),
        TaskV2.actions.addTask({ id: "one" }),
      ),
      TaskV2.actions.setTitle({ title: "from v2" }),
    );
    expect(authored.state.global.title).toBe("from v2");
    const zip = await createZip(authored);

    // v2 replays both operations.
    const loadedByV2 = await TaskV2.utils.loadFromInput(zip);
    expect(loadedByV2.state.global).toStrictEqual({
      title: "from v2",
      tasks: [{ id: "one", completed: false }],
    });

    // v1 registers only its own reducer, so the shared runtime refuses a
    // v2-stamped document outright — the same refusal a generated v1 module
    // gives, and the reason a module must not close over its successors'
    // reducers.
    await expect(TaskV1.utils.loadFromInput(zip)).rejects.toThrow(
      /No reducer registered for document version 2\. Available versions: 1/,
    );

    // Its own history still loads.
    const v1Zip = await createZip(
      TaskV1.reducer(
        TaskV1.utils.createDocument(),
        TaskV1.actions.addTask({ id: "own" }),
      ),
    );
    const loadedByV1 = await TaskV1.utils.loadFromInput(v1Zip);
    expect(loadedByV1.state.global).toStrictEqual({
      tasks: [{ id: "own", completed: false }],
    });
  }, 30_000);

  it("matches a one-version family for a single-version finalize", () => {
    const finalized = taskV1Context.finalize({
      modules: [],
    });
    const family = defineDocumentModelFamily({
      versions: [taskV1Context.version({ modules: [] })],
      upgradeManifest: manifestFor([1], "test/task"),
    });
    expect(finalized.definition).toStrictEqual(family.at(1).definition);
    expect(finalized.documentModel).toStrictEqual(family.at(1).documentModel);
    expect(Object.keys(finalized.actions)).toStrictEqual(
      Object.keys(family.at(1).actions),
    );
    expect(family.upgradeManifest).toStrictEqual({
      documentType: "test/task",
      latestVersion: 1,
      supportedVersions: [1],
      upgrades: {},
    });
  });

  it("rejects an empty version tuple", () => {
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [],
        upgradeManifest: manifestFor([]),
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["versions"],
    });
  });

  it("rejects a forged version token at its authored path", () => {
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [
          contextAt(1),
          {
            kind: "powerhouse.document-model-version",
            version: 2,
            documentType: "test/family",
          },
        ],
        upgradeManifest: manifestFor([1, 2]),
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["versions", 1],
    });
    expect(diagnostics[0]?.repair).toContain("not registrable");
  });

  it("rejects two document types in one family", () => {
    const diagnostics = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [contextAt(1), contextAt(2, { id: "test/other" })],
        upgradeManifest: manifestFor([1, 2]),
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["versions", 1, "documentType"],
    });
  });

  it("rejects non-contiguous, duplicate, and descending versions", () => {
    const cases: readonly (readonly [string, readonly number[]])[] = [
      ["non-contiguous", [1, 3]],
      ["duplicate", [1, 1]],
      ["descending", [2, 1]],
    ];
    for (const [label, versions] of cases) {
      const diagnostics = diagnosticsOf(() =>
        defineDocumentModelFamily({
          versions: versions.map((version) => contextAt(version)),
          upgradeManifest: manifestFor(versions),
        }),
      );
      expect(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "PH-DM-DECLARATION-INVALID" &&
            diagnostic.path.join("/") === "versions/1/version",
        ),
        label,
      ).toBe(true);
    }
  });

  it("rejects a non-integer version at the declaration", () => {
    expect(diagnosticsOf(() => contextAt(1.5))[0]?.path).toStrictEqual([
      "version",
    ]);
  });

  it("rejects an absent manifest, or one that disagrees with the versions", () => {
    const absent = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [contextAt(1)],
        upgradeManifest: undefined as never,
      }),
    );
    expect(absent[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["upgradeManifest"],
    });

    const otherType = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [contextAt(1)],
        upgradeManifest: manifestFor([1], "test/other"),
      }),
    );
    expect(otherType[0]).toMatchObject({
      path: ["upgradeManifest", "documentType"],
      expected: "test/family",
      received: "test/other",
    });

    // v2 added to the family, `upgrades/versions.ts` not updated.
    const staleVersions = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [contextAt(1), contextAt(2)],
        upgradeManifest: {
          ...manifestFor([1]),
          upgrades: { v2: transitionTo(2) },
        },
      }),
    );
    const at = (...path: string[]) =>
      staleVersions.find(
        (diagnostic) => diagnostic.path.join("/") === path.join("/"),
      );
    expect(at("upgradeManifest", "supportedVersions")).toMatchObject({
      expected: "[1,2]",
      received: "[1]",
    });
    expect(at("upgradeManifest", "latestVersion")).toMatchObject({
      expected: "2",
      received: "1",
    });
  });

  it("rejects a missing, extra, wrong-target, or broken transition", () => {
    const missing = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [contextAt(1), contextAt(2)],
        upgradeManifest: { ...manifestFor([1, 2]), upgrades: {} },
      }),
    );
    expect(missing[0]).toMatchObject({
      code: "PH-DM-DECLARATION-INVALID",
      path: ["upgradeManifest", "upgrades"],
      expected: "v2",
      received: "no transitions",
    });

    const extra = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [contextAt(1)],
        upgradeManifest: {
          ...manifestFor([1]),
          upgrades: { v2: transitionTo(2) },
        },
      }),
    );
    expect(extra[0]).toMatchObject({
      path: ["upgradeManifest", "upgrades"],
      expected: "no transitions",
      received: "v2",
    });

    const wrongTarget = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [contextAt(1), contextAt(2)],
        upgradeManifest: {
          ...manifestFor([1, 2]),
          upgrades: { v2: transitionTo(3) },
        },
      }),
    );
    expect(wrongTarget[0]).toMatchObject({
      path: ["upgradeManifest", "upgrades", "v2", "toVersion"],
      expected: "2",
      received: "3",
    });

    const notCallable = diagnosticsOf(() =>
      defineDocumentModelFamily({
        versions: [contextAt(1), contextAt(2)],
        upgradeManifest: {
          ...manifestFor([1, 2]),
          upgrades: { v2: { toVersion: 2, upgradeReducer: "no" as never } },
        },
      }),
    );
    expect(notCallable[0]).toMatchObject({
      path: ["upgradeManifest", "upgrades", "v2", "upgradeReducer"],
    });
  });

  it("rejects a version token used as a registrable module", () => {
    expect(Object.keys(TaskV1Definition)).toStrictEqual([
      "kind",
      "version",
      "documentType",
    ]);
    expect(TaskV2Definition).not.toHaveProperty("reducer");
    expect(TaskV2Definition).not.toHaveProperty("documentModel");
  });
});
