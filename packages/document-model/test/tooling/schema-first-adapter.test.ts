import {
  defaultBaseState,
  type DocumentModelDefinition,
  type DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineScalar } from "../../scalars.js";
import { canonicalDigest } from "../../src/definition/kernel/primitives.js";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/tooling/adapters/code-first-document-model-source-adapter.js";
import { adaptSchemaFirstDocumentModelModule } from "../../src/definition/tooling/schema-first/schema-first-document-model-module-adapter.js";
import {
  codeFirstParity,
  schemaFirstParity,
} from "../definition/fixtures/parity-model.js";
import { operation, storedModel } from "./project-fixtures.js";

const source = { specifier: "./document-models/parity/module.ts" } as const;

function hostView(definition: DocumentModelDefinition) {
  return {
    model: definition.model,
    specifications: definition.specifications.map((specification) => ({
      version: specification.version,
      roots: [specification.state.global.root, specification.state.local.root],
      initialValues: [
        specification.state.global.initialValue,
        specification.state.local.initialValue,
      ],
      types: specification.types
        .map(({ name, kind }) => `${kind} ${name}`)
        .sort(),
      modules: specification.modules.map((module) => ({
        key: module.key,
        operations: module.operations.map((operation) => ({
          key: operation.key,
          actionType: operation.actionType,
          creatorKey: operation.creatorKey,
          scope: operation.scope,
          input: operation.input?.fields.map(({ name, type }) => ({
            name,
            type,
          })),
        })),
      })),
    })),
  };
}

function withSpecification(
  change: (
    specification: DocumentModelPHState["global"]["specifications"][number],
  ) => DocumentModelPHState["global"]["specifications"][number],
) {
  const { global } = schemaFirstParity.documentModel;
  return {
    ...schemaFirstParity,
    documentModel: {
      ...schemaFirstParity.documentModel,
      global: {
        ...global,
        specifications: global.specifications.map(change),
      },
    },
  };
}

function codesAndPaths(value: unknown) {
  return adaptSchemaFirstDocumentModelModule(value, source).diagnostics.map(
    ({ code, path }) => ({ code, path }),
  );
}

describe("adaptSchemaFirstDocumentModelModule", () => {
  it("normalizes a generated module to the model its code-first twin compiles to", () => {
    const schemaFirst = adaptSchemaFirstDocumentModelModule(
      schemaFirstParity,
      source,
    );
    const codeFirst = adaptCodeFirstDocumentModelSource(
      codeFirstParity,
      source,
    );
    expect(schemaFirst.diagnostics).toEqual([]);
    expect(codeFirst.diagnostics).toEqual([]);
    expect(hostView(schemaFirst.artifacts[0].definition)).toEqual(
      hostView(codeFirst.artifacts[0].definition),
    );
  });

  it("preserves stored IDs, names and SDL instead of deriving them", () => {
    const [artifact] = adaptSchemaFirstDocumentModelModule(
      schemaFirstParity,
      source,
    ).artifacts;
    const stored = schemaFirstParity.documentModel.global.specifications[0];
    const [specification] = artifact.definition.specifications;
    expect({
      kind: artifact.kind,
      source: artifact.source,
      documentType: artifact.documentType,
      version: artifact.version,
      digest: artifact.digest,
      compatibility: artifact.definition.compatibility,
      moduleIds: specification.modules.map(({ id, name }) => [id, name]),
      operationIds: specification.modules[0].operations.map(({ id, name }) => [
        id,
        name,
      ]),
      globalSchema: specification.state.global.materialized.schema,
      astDefinitions:
        specification.graphQLCompatibility?.document.definitions.length,
    }).toEqual({
      kind: "powerhouse.document-model-artifact",
      source,
      documentType: "test/parity",
      version: 1,
      digest: canonicalDigest(artifact.definition),
      compatibility: {
        identity: "explicit-schema-first",
        scalarCoercion: "catalog-v1",
        serialization: "explicit-schema-first",
      },
      moduleIds: [["module-todos", "todos"]],
      operationIds: stored.modules[0].operations.map(({ id, name }) => [
        id,
        name,
      ]),
      globalSchema: stored.state.global.schema,
      astDefinitions: 7,
    });
    expect(artifact.documentModel).toBe(schemaFirstParity.documentModel);
  });

  it("keeps the generated module key when a digit follows an acronym", () => {
    const result = adaptSchemaFirstDocumentModelModule(
      withSpecification((specification) => ({
        ...specification,
        modules: specification.modules.map((module) => ({
          ...module,
          name: "API1foo",
        })),
      })),
      source,
    );
    expect(result.diagnostics).toEqual([]);
    expect(
      result.artifacts[0].definition.specifications[0].modules[0].key,
    ).toBe("api1foo");
  });

  it("normalizes a project scalar using the package's scalar definition", () => {
    const Iban = defineScalar({ name: "Iban", schema: z.string() });
    const model = withSpecification((specification) => ({
      ...specification,
      state: {
        ...specification.state,
        global: {
          ...specification.state.global,
          schema: `scalar Iban\n${specification.state.global.schema.replace("{", "{ iban: Iban ")}`,
        },
      },
    }));
    const result = adaptSchemaFirstDocumentModelModule(model, source, {
      scalars: [Iban],
    });
    expect(result.diagnostics).toEqual([]);
    expect(
      result.artifacts[0].definition.specifications[0].scalars,
    ).toContainEqual({
      name: "Iban",
      implementation: "package#Iban",
      coercionProfile: "catalog-v1",
      definition: {
        kind: "powerhouse.scalar",
        formatVersion: 1,
        name: "Iban",
        representation: "string",
        description: "",
        coercion: { source: "derived" },
        coercionProfile: "catalog-v1",
      },
    });
  });

  it("names a scalar no catalog or project scalar provides", () => {
    const model = withSpecification((specification) => ({
      ...specification,
      state: {
        ...specification.state,
        global: {
          ...specification.state.global,
          schema: `scalar Iban\n${specification.state.global.schema.replace("{", "{ iban: Iban ")}`,
        },
      },
    }));
    expect(
      adaptSchemaFirstDocumentModelModule(model, source).diagnostics.map(
        ({ code, path, received }) => ({ code, path, received }),
      ),
    ).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["specifications", 0, "state", "global", "schema"],
        received: "Iban",
      },
    ]);
  });

  it.each([
    ["declares", (schema: string) => `scalar MissingScalar\n${schema}`],
    [
      "uses in a type extension",
      (schema: string) =>
        `${schema}\nextend type ParityState { bic: MissingScalar }`,
    ],
  ])("names a scalar the stored schema %s without an export", (_, edit) => {
    const model = withSpecification((specification) => ({
      ...specification,
      state: {
        ...specification.state,
        global: {
          ...specification.state.global,
          schema: edit(specification.state.global.schema),
        },
      },
    }));
    expect(
      adaptSchemaFirstDocumentModelModule(model, source).diagnostics.map(
        ({ code, path, received }) => ({ code, path, received }),
      ),
    ).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["specifications", 0, "state", "global", "schema"],
        received: "MissingScalar",
      },
    ]);
  });

  it("reports a malformed stored model instead of throwing", () => {
    const result = adaptSchemaFirstDocumentModelModule({ global: {} }, source);
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(
      result.diagnostics.every(
        ({ code }) => code === "PH-DM-DECLARATION-INVALID",
      ),
    ).toBe(true);
  });

  it("reports a nested accessor without evaluating it", () => {
    let reads = 0;
    const model = withSpecification((specification) => ({
      ...specification,
      get modules(): never {
        reads++;
        throw new Error("accessor evaluated");
      },
    }));
    const result = adaptSchemaFirstDocumentModelModule(model, source);
    expect(reads).toBe(0);
    expect(result.artifacts).toEqual([]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "PH-DM-DECLARATION-INVALID",
    ]);
  });

  it("accepts the stored state without its module", () => {
    expect(
      adaptSchemaFirstDocumentModelModule(
        schemaFirstParity.documentModel,
        source,
      ).artifacts[0].definition,
    ).toEqual(
      adaptSchemaFirstDocumentModelModule(schemaFirstParity, source)
        .artifacts[0].definition,
    );
  });

  it("reports SDL the parser refuses at its stored segment", () => {
    expect(
      codesAndPaths(
        withSpecification((specification) => ({
          ...specification,
          state: {
            ...specification.state,
            local: { ...specification.state.local, schema: "type {" },
          },
        })),
      ),
    ).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["specifications", 0, "state", "local", "schema"],
      },
    ]);
  });

  it("blocks an operation whose stored name never produced a symbol", () => {
    expect(
      codesAndPaths(
        withSpecification((specification) => ({
          ...specification,
          modules: specification.modules.map((module) => ({
            ...module,
            operations: module.operations.map((operation, index) =>
              index === 0 ? { ...operation, name: " " } : operation,
            ),
          })),
        })),
      ),
    ).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["specifications", 0, "modules", 0, "operations", 0, "name"],
      },
    ]);
  });

  it("requires the global state root named after the model", () => {
    expect(
      codesAndPaths(
        withSpecification((specification) => ({
          ...specification,
          state: {
            ...specification.state,
            global: {
              ...specification.state.global,
              schema: specification.state.global.schema.replace(
                "type ParityState",
                "type OtherState",
              ),
            },
          },
        })),
      ),
    ).toEqual([
      {
        code: "PH-DM-STATE-ROOT-INVALID",
        path: ["specifications", 0, "state", "global", "schema"],
      },
    ]);
  });

  it("reports a value that is neither a module nor a stored state", () => {
    expect(codesAndPaths("not a module")).toEqual([
      { code: "PH-DM-DECLARATION-INVALID", path: [] },
    ]);
  });
});

describe("adaptSchemaFirstDocumentModelModule: type extensions", () => {
  const adapt = (globalSchema: string, operationSchema: string) =>
    adaptSchemaFirstDocumentModelModule(
      {
        ...defaultBaseState(),
        global: JSON.parse(
          storedModel("test/shelf", "Shelf", {
            globalSchema,
            modules: [
              {
                id: "main",
                name: "main",
                description: null,
                operations: [operation("SET_TITLE", operationSchema)],
              },
            ],
          }),
        ) as unknown,
        local: {},
      },
      source,
    );
  const SET_TITLE = "input SetTitleInput {\n  title: String!\n}";
  const fieldsOf = (result: ReturnType<typeof adapt>) =>
    result.artifacts[0].definition.specifications[0].types.map((type) => ({
      name: type.name,
      fields: "fields" in type ? type.fields.map(({ name }) => name) : [],
    }));

  it("folds a field declared only in an extension into the type it extends", () => {
    const result = adapt(
      "type ShelfState {\n  title: String!\n}\n\nextend type ShelfState {\n  iban: String\n}",
      SET_TITLE,
    );
    expect(result.diagnostics).toEqual([]);
    expect(fieldsOf(result)).toEqual([
      { name: "ShelfState", fields: ["title", "iban"] },
    ]);
  });

  it("folds an extension an operation schema declares into a state type", () => {
    const result = adapt(
      "type ShelfState {\n  title: String!\n}",
      `${SET_TITLE}\n\nextend type ShelfState {\n  note: String\n}`,
    );
    expect(result.diagnostics).toEqual([]);
    expect(fieldsOf(result)).toEqual([
      { name: "ShelfState", fields: ["title", "note"] },
    ]);
  });
});
