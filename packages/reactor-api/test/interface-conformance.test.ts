import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { fileURLToPath } from "node:url";
import {
  canonicalDigest,
  defineDocumentModel,
  DocumentModelDefinitionError,
  ph,
} from "document-model";
import {
  checkDefinitions,
  DefinitionSourceLoader,
  schemaFirstGraphQLDocument,
} from "document-model/tooling";
import { expect, it } from "vitest";
import { buildDocumentModelSchema } from "../src/utils/create-schema.js";

async function checkModel(model: unknown) {
  const loader = new DefinitionSourceLoader({
    importModule: () => Promise.resolve({ model }),
  });
  try {
    return await checkDefinitions({
      profile: "edit",
      loader,
      packageRevision: canonicalDigest("interface-conformance"),
      configFile: fileURLToPath(
        new URL(
          "../../document-model/test/tooling/fixtures/interfaces/powerhouse.config.json",
          import.meta.url,
        ),
      ),
    });
  } finally {
    await loader.dispose();
  }
}

it("refuses at finalize the missing interface field that the real host refuses", () => {
  const Named = ph.interface("Named", {
    fields: { label: ph.String({ required: true }) },
  });
  const finalizeMissing = () =>
    defineDocumentModel({
      id: "test/missing",
      name: "Missing",
      description: "",
      extension: "missing",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("MissingState", {
            implements: [Named],
            fields: { other: ph.String() },
          }),
          initialValue: { other: null },
        },
        local: { schema: null, initialValue: {} },
      },
    }).finalize({ modules: [] });
  let refused: unknown;
  try {
    finalizeMissing();
  } catch (error) {
    refused = error;
  }
  expect(refused).toBeInstanceOf(DocumentModelDefinitionError);
  expect(
    (refused as DocumentModelDefinitionError).diagnostics.map(
      ({ code, path, message }) => ({ code, path, message }),
    ),
  ).toStrictEqual([
    {
      code: "PH-DM-INTERFACE-INVALID",
      path: ["specifications", "global", "schema"],
      message:
        "Interface field Named.label expected but MissingState does not provide it.",
    },
  ]);
});

function compatibilityModel(withRootImplementation: boolean) {
  const Named = ph.interface("Named", {
    fields: { label: ph.String({ required: true }) },
  });
  return defineDocumentModel({
    id: "test/probe",
    name: "Probe",
    description: "",
    extension: "probe",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      auxiliaryTypes: [Named],
      graphQLCompatibility: schemaFirstGraphQLDocument(
        withRootImplementation
          ? [
              "type ProbeState { label: String! }",
              "interface Named { label: String! }",
              "type Query implements Named { other: String }",
            ]
          : [
              "type ProbeState implements Named { label(term: DateTime): String! }",
              "interface Named { label(term: DateTime): String! }",
            ],
      ),
      global: {
        schema: ph.object("ProbeState", {
          implements: withRootImplementation ? [] : [Named],
          fields: { label: ph.String({ required: true }) },
        }),
        initialValue: { label: "" },
      },
      local: { schema: null, initialValue: {} },
    },
  }).finalize({ modules: [] });
}

it("checks the compatibility-only root implementation that the host refuses", async () => {
  const model = compatibilityModel(true);
  const report = await checkModel(model);
  expect(report.status).toBe("invalid");
  expect(report.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "PH-DM-INTERFACE-INVALID",
      path: [
        "specifications",
        0,
        "graphQLCompatibility",
        "document",
        "definitions",
        2,
      ],
      message:
        "Interface field Named.label expected but Query does not provide it.",
    }),
  );
  expect(report.definitions).toHaveLength(1);
  expect(() =>
    buildDocumentModelSchema(model as unknown as DocumentModelModule),
  ).toThrow(
    /Interface field .*Named.label expected but .*Query does not provide it\./,
  );
});

it("accepts matching arguments using the scalar catalog supplied by the host", async () => {
  const model = compatibilityModel(false);
  const report = await checkModel(model);
  expect(report.status).toBe("ok");
  expect(report.diagnostics).toStrictEqual([]);
  expect(() =>
    buildDocumentModelSchema(model as unknown as DocumentModelModule),
  ).not.toThrow();
});
