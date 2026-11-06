import { describe, expect, it } from "vitest";
import {
  inspectDocumentModelDefinition,
  operationsByActionType,
} from "../../../src/definition/index.js";
import { TaskFamily } from "../fixtures/family-model.js";
import {
  codeFirstParity,
  schemaFirstParity,
} from "../fixtures/parity-model.js";

const summary = (diagnostics: readonly { code: string; path: unknown }[]) =>
  diagnostics.map(({ code, path }) => ({ code, path }));

describe("inspectDocumentModelDefinition", () => {
  it("reads a schema-first module as stored with no definition", () => {
    expect(inspectDocumentModelDefinition(schemaFirstParity)).toStrictEqual({
      kind: "stored",
      reason: "absent",
    });
  });

  it("serves the last specification of a family module as structured", () => {
    const module = TaskFamily.at(1);
    const inspection = inspectDocumentModelDefinition(module);
    expect(inspection.kind).toBe("structured");
    if (inspection.kind !== "structured") return;
    expect(inspection.definition).toStrictEqual(module.definition);
    expect(inspection.definition).not.toBe(module.definition);
    expect(inspection.specification.version).toBe(2);
    expect(inspection.specification).toBe(
      inspection.definition.specifications[1],
    );
  });

  it("refuses a malformed definition with the wire-shape diagnostics", () => {
    const inspection = inspectDocumentModelDefinition({
      ...codeFirstParity,
      definition: { ...codeFirstParity.definition, formatVersion: 2 },
    });
    expect(inspection.kind).toBe("stored");
    expect(
      "diagnostics" in inspection
        ? { reason: inspection.reason, ...summary(inspection.diagnostics)[0] }
        : inspection,
    ).toStrictEqual({
      reason: "invalid",
      code: "PH-DM-DECLARATION-INVALID",
      path: ["definition", "formatVersion"],
    });
  });

  it.each([null, []])(
    "reads the non-object definition %j as invalid without throwing",
    (definition) => {
      const inspection = inspectDocumentModelDefinition({
        ...codeFirstParity,
        definition,
      });
      expect(
        inspection.kind === "stored" && inspection.reason === "invalid"
          ? summary(inspection.diagnostics)
          : inspection,
      ).toStrictEqual([
        { code: "PH-DM-DECLARATION-INVALID", path: ["definition"] },
      ]);
    },
  );

  it("reports a definition of another document type as a mismatch", () => {
    const inspection = inspectDocumentModelDefinition({
      ...codeFirstParity,
      documentModel: {
        ...codeFirstParity.documentModel,
        global: { ...codeFirstParity.documentModel.global, id: "test/other" },
      },
    });
    expect(inspection).toMatchObject({
      kind: "stored",
      reason: "mismatch",
      diagnostics: [
        {
          code: "PH-DM-DECLARATION-INVALID",
          path: ["definition", "model", "documentType"],
          expected: "test/other",
          received: "test/parity",
        },
      ],
    });
  });

  it("reports a module version no specification carries as a mismatch", () => {
    const inspection = inspectDocumentModelDefinition({
      ...TaskFamily.at(2),
      version: 3,
    });
    expect(inspection).toMatchObject({
      kind: "stored",
      reason: "mismatch",
      diagnostics: [
        {
          code: "PH-DM-DECLARATION-INVALID",
          path: ["definition", "specifications"],
          expected: "a specification for version 3",
          received: "1, 2",
        },
      ],
    });
  });

  it("reads a module without a numeric version by its definition alone", () => {
    const { version: _version, ...unversioned } = codeFirstParity;
    const inspection = inspectDocumentModelDefinition(unversioned);
    expect(
      inspection.kind === "structured" && inspection.specification.version,
    ).toBe(1);
  });

  it.each([
    [
      "explicit-schema-first serialization",
      (definition: typeof codeFirstParity.definition) => ({
        ...definition,
        compatibility: {
          ...definition.compatibility,
          serialization: "explicit-schema-first" as const,
        },
      }),
    ],
    [
      "a retained GraphQL document",
      (definition: typeof codeFirstParity.definition) => ({
        ...definition,
        specifications: definition.specifications.map((specification) => ({
          ...specification,
          graphQLCompatibility: {
            kind: "graphql-ast-v1" as const,
            document: { kind: "Document" as const, definitions: [] },
            preserveDefinitionOrder: true as const,
          },
        })),
      }),
    ],
  ])("serves a definition with %s from its stored model", (_, retain) => {
    expect(
      inspectDocumentModelDefinition({
        ...codeFirstParity,
        definition: retain(codeFirstParity.definition),
      }),
    ).toStrictEqual({ kind: "stored", reason: "retained" });
  });

  it("reads a definition the shape check cannot walk as invalid", () => {
    const definition: {
      specifications: { types: { fields?: { type: unknown }[] }[] }[];
    } = structuredClone(codeFirstParity.definition) as never;
    const cyclic: Record<string, unknown> = { kind: "list", required: false };
    cyclic.item = cyclic;
    const type = definition.specifications[0].types.find(
      (candidate) => candidate.fields !== undefined,
    )!;
    type.fields![0].type = cyclic;
    const inspection = inspectDocumentModelDefinition({
      ...codeFirstParity,
      definition,
    });
    expect(
      "diagnostics" in inspection
        ? {
            reason: inspection.reason,
            ...summary(inspection.diagnostics)[0],
            received: inspection.diagnostics[0].received,
          }
        : inspection,
    ).toStrictEqual({
      reason: "invalid",
      code: "PH-DM-DECLARATION-INVALID",
      path: ["definition"],
      received: "RangeError",
    });
  });

  it.each([
    [new Error("unreadable definition"), "unreadable definition", "Error"],
    [
      Object.create(null) as unknown,
      "a thrown value that cannot be described",
      "object",
    ],
  ])(
    "reads a definition whose getter throws %s as invalid",
    (thrown, described, received) => {
      const module = {
        ...codeFirstParity,
        get definition(): unknown {
          throw thrown;
        },
      };
      const inspection = inspectDocumentModelDefinition(module);
      expect(
        "diagnostics" in inspection
          ? {
              reason: inspection.reason,
              ...summary(inspection.diagnostics)[0],
              message: inspection.diagnostics[0].message,
              received: inspection.diagnostics[0].received,
            }
          : inspection,
      ).toStrictEqual({
        reason: "invalid",
        code: "PH-DM-DECLARATION-INVALID",
        path: ["definition"],
        message: `The structured definition cannot be read: ${described}`,
        received,
      });
    },
  );

  it("reads a proxy definition as invalid", () => {
    const definition = new Proxy(structuredClone(codeFirstParity.definition), {
      get(target, key, receiver) {
        if (key === "model") throw new Error("definition proxy read");
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    expect(
      inspectDocumentModelDefinition({ ...codeFirstParity, definition }),
    ).toMatchObject({ kind: "stored", reason: "invalid" });
  });

  it("returns a frozen snapshot that later edits to the module's definition cannot reach", () => {
    const definition = structuredClone(codeFirstParity.definition);
    const inspection = inspectDocumentModelDefinition({
      ...codeFirstParity,
      definition,
    });
    if (inspection.kind !== "structured") throw new Error(inspection.kind);
    (definition.model as { documentType: string }).documentType = "edited";
    expect(inspection.definition.model.documentType).toBe("test/parity");
    expect(Object.isFrozen(inspection.specification.types[0])).toBe(true);
    expect(() => {
      (inspection.definition.model as { documentType: string }).documentType =
        "edited";
    }).toThrow(TypeError);
  });

  it("checks a definition object once and a replacement afresh", () => {
    const definition = structuredClone(codeFirstParity.definition);
    const module = { ...codeFirstParity, definition };
    const first = inspectDocumentModelDefinition(module);
    const again = inspectDocumentModelDefinition({ ...module });
    expect(first.kind === "structured" && again.kind === "structured").toBe(
      true,
    );
    if (first.kind !== "structured" || again.kind !== "structured") return;
    expect(again.definition).toBe(first.definition);
    const replaced = inspectDocumentModelDefinition({
      ...module,
      definition: structuredClone(definition),
    });
    expect(replaced.kind === "structured" && replaced.definition).not.toBe(
      first.definition,
    );
  });
});

describe("operationsByActionType", () => {
  it("names each code-first operation's stored name and creator by action type", () => {
    expect([...operationsByActionType(TaskFamily.at(1))]).toStrictEqual([
      ["ADD_TASK", { storedName: "AddTask", creatorKey: "addTask" }],
      ["SET_TITLE", { storedName: "SetTitle", creatorKey: "setTitle" }],
    ]);
  });

  it.each([
    ["a schema-first module", schemaFirstParity],
    ["an invalid definition", { ...codeFirstParity, definition: [] }],
  ])("is empty for %s, served from its stored model", (_, module) => {
    expect(operationsByActionType(module).size).toBe(0);
  });
});
