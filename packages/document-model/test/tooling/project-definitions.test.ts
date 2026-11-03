import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkProjectDefinitions,
  documentModelChecks,
} from "../../src/definition/tooling/check/check-project-definitions.js";
import type { DefinitionProducer } from "../../src/definition/tooling/adapters/producer.js";
import type { DefinitionCheck } from "../../src/definition/tooling/check/types.js";
import type { DefinitionCheckInput } from "../../src/definition/tooling/report/types.js";
import { inspectProjectDefinitions } from "../../src/definition/tooling/inspect/inspect-project-definitions.js";
import { defaultDefinitionProducers } from "../../src/definition/tooling/project/project-definitions.js";
import { loadFixture, storedModel } from "./project-fixtures.js";

const WALLET = { specifier: "./document-models/wallet/wallet.json" } as const;
const LEDGER = { specifier: "./document-models/ledger/index.ts" } as const;

const ORPHAN = `import { defineDocumentModel, materialize, ph } from "document-model";

const model = defineDocumentModel({
  id: "example/notes",
  name: "Notes",
  description: "",
  extension: ".notes",
  version: 1,
  author: { name: "Fixture", website: null },
  scopes: {
    global: {
      schema: ph.object("NotesState", { fields: { text: ph.String() } }),
      initialValue: { text: null },
    },
    local: { schema: null, initialValue: {} },
  },
});

export const Notes = materialize(model.version({ modules: [] }));
`;

const brief = (diagnostics: readonly DefinitionDiagnostic[]) =>
  diagnostics.map(({ code, source, path }) => ({ code, source, path }));

describe("loadProjectDefinitions on a schema-first package", () => {
  it("adapts each stored model with the package's project scalars", async () => {
    const { project, report } = await loadFixture("stored");
    expect(project.skipReason).toBe("definition-sources-absent");
    expect(project.unregistered).toEqual([]);
    expect(project.artifacts[0].definition.specifications[0].scalars).toEqual([
      {
        name: "Amount_Money",
        implementation: "powerhouse.catalog#Amount_Money",
        coercionProfile: "catalog-v1",
      },
      {
        name: "Iban",
        implementation: "package#Iban",
        coercionProfile: "catalog-v1",
        definition: {
          kind: "powerhouse.scalar",
          formatVersion: 1,
          name: "Iban",
          representation: "string",
          description: "International bank account number",
          coercion: { source: "derived" },
          coercionProfile: "catalog-v1",
        },
      },
    ]);
    expect({ ...report, definitions: undefined }).toEqual({
      kind: "powerhouse.definition-check",
      formatVersion: 1,
      profile: "edit",
      status: "ok",
      sourceSet: project.sourceSet,
      definitions: undefined,
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
    });
    expect(report.definitions).toEqual([
      {
        kind: "document-model",
        key: "example/wallet",
        version: 1,
        digest: project.artifacts[0].digest,
        source: WALLET,
      },
    ]);
  });

  it("names a scalar that scalars/index.ts does not export", async () => {
    const { report } = await loadFixture("stored", {
      configFile: "missing-scalar.config.json",
    });
    expect(report.status).toBe("invalid");
    expect(report.diagnostics).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        severity: "error",
        phase: "definition",
        source: { specifier: "./unscalared/bank/bank.json" },
        definition: { kind: "document-model", key: "example/bank", version: 1 },
        path: ["specifications", 0, "state", "global", "schema"],
        message:
          "The stored schema uses scalar Bic, which is not a GraphQL built-in, a catalog scalar, or a project scalar exported from scalars/index.ts.",
        expected: "a scalar defined with defineScalar in scalars/index.ts",
        received: "Bic",
        repair:
          "Export Bic from scalars/index.ts with defineScalar, or use a catalog scalar.",
      },
    ]);
  });

  it("counts a project scalar only under its own export name, as codegen imports it", async () => {
    const { report } = await loadFixture("stored", {
      files: {
        "scalars/index.ts": [
          'import { defineScalar } from "document-model/scalars";',
          'import { z } from "zod";',
          'const Iban = defineScalar({ name: "Iban", description: "", schema: z.string(), example: "DE89370400440532013000" });',
          "export { Iban as RenamedIban };",
          "",
        ].join("\n"),
      },
    });
    expect(report.status).toBe("invalid");
    expect(
      report.diagnostics.map(({ code, source, path, received }) => ({
        code,
        source,
        path,
        received,
      })),
    ).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        source: WALLET,
        path: ["specifications", 0, "state", "global", "schema"],
        received: "Iban",
      },
    ]);
  });

  it("reports a scalars module that throws as an import failure, without its absolute path", async () => {
    const { root, report } = await loadFixture("stored", {
      files: {
        "scalars/index.ts":
          "throw new Error(`broken in ${import.meta.url}`);\n",
      },
    });
    expect(report.status).toBe("failed");
    expect(brief(report.diagnostics)).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        source: WALLET,
        path: ["specifications", 0, "state", "global", "schema"],
      },
      {
        code: "PH-IMPORT-FAILED",
        source: { specifier: "./scalars/index.ts" },
        path: [],
      },
    ]);
    expect(report.diagnostics[1].received).toBe(
      "Error: broken in ./scalars/index.ts",
    );
    expect(JSON.stringify(report)).not.toContain(root);
  });

  it("serves every stored version and reports unreadable models without throwing", async () => {
    const { project, report } = await loadFixture("stored", {
      files: {
        "document-models/shelf/shelf.json": storedModel("test/shelf", "Shelf", {
          versions: [1, 2],
        }),
        "document-models/broken/broken.json": "{ not json",
        "document-models/empty/empty.json": '{ "id": "test/empty" }',
        "document-models/loose/other-name.json": "{ not read }",
      },
    });
    expect(
      project.artifacts.map(({ documentType, version, source }) => [
        documentType,
        version,
        source.specifier,
      ]),
    ).toEqual([
      ["example/wallet", 1, WALLET.specifier],
      ["test/shelf", 1, "./document-models/shelf/shelf.json"],
      ["test/shelf", 2, "./document-models/shelf/shelf.json"],
    ]);
    expect(report.status).toBe("invalid");
    expect(
      brief(report.diagnostics).filter(
        ({ source }) =>
          source?.specifier !== "./document-models/empty/empty.json",
      ),
    ).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        source: { specifier: "./document-models/broken/broken.json" },
        path: [],
      },
    ]);
    expect(
      report.diagnostics
        .filter(
          ({ source }) =>
            source?.specifier === "./document-models/empty/empty.json",
        )
        .map(({ path }) => path[0]),
    ).toEqual(["author", "description", "extension", "name", "specifications"]);
  });

  it("names a scalar the stored schema declares or a type extension uses without an export", async () => {
    const wallet = JSON.parse(
      readFileSync(
        join(
          import.meta.dirname,
          "fixtures/stored/document-models/wallet/wallet.json",
        ),
        "utf8",
      ),
    ) as { specifications: { state: { global: { schema: string } } }[] };
    const [specification] = wallet.specifications;
    const schema = specification.state.global.schema;
    for (const edited of [
      `scalar MissingScalar\n${schema}`,
      `${schema}\n\nextend type WalletState {\n  bic: MissingScalar\n}`,
    ]) {
      specification.state.global.schema = edited;
      const { report } = await loadFixture("stored", {
        files: { "document-models/wallet/wallet.json": JSON.stringify(wallet) },
      });
      expect({
        status: report.status,
        diagnostics: report.diagnostics.map(
          ({ code, source, path, received }) => ({
            code,
            source,
            path,
            received,
          }),
        ),
      }).toEqual({
        status: "invalid",
        diagnostics: [
          {
            code: "PH-DM-DECLARATION-INVALID",
            source: WALLET,
            path: ["specifications", 0, "state", "global", "schema"],
            received: "MissingScalar",
          },
        ],
      });
    }
  });

  it.each([
    [
      "a documentModelsDir that names a file",
      { configFile: "file.config.json" },
      {
        code: "PH-CONFIG-SOURCE-INVALID",
        source: undefined,
        path: ["documentModelsDir"],
      },
    ],
    [
      "an unreadable documentModelsDir",
      { unreadable: ["document-models"] },
      {
        code: "PH-IMPORT-FAILED",
        source: { specifier: "./document-models" },
        path: [],
      },
    ],
    [
      "an unreadable model directory",
      { unreadable: ["document-models/wallet"] },
      {
        code: "PH-IMPORT-FAILED",
        source: { specifier: "./document-models/wallet" },
        path: [],
      },
    ],
  ])(
    "fails on %s instead of reading it as empty",
    async (_, options, found) => {
      const { project, report } = await loadFixture("stored", {
        ...options,
        files: {
          "file.config.json": '{ "documentModelsDir": "./package.json" }',
        },
      });
      expect(project.artifacts).toEqual([]);
      expect({
        status: report.status,
        diagnostics: brief(report.diagnostics),
      }).toEqual({
        status: "failed",
        diagnostics: [found],
      });
    },
  );

  it("refuses a documentModelsDir outside the package", async () => {
    const { project, report } = await loadFixture("stored", {
      configFile: "outside.config.json",
      files: {
        "outside.config.json": '{ "documentModelsDir": "../elsewhere" }',
      },
    });
    expect(project.artifacts).toEqual([]);
    expect(report.status).toBe("failed");
    expect(report.diagnostics).toMatchObject([
      {
        code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        path: ["documentModelsDir"],
        received: "../elsewhere",
      },
    ]);
  });

  it("skips a schema-first package with nothing to check", async () => {
    const { report } = await loadFixture("schema-first");
    expect({ status: report.status, skipReason: report.skipReason }).toEqual({
      status: "skipped",
      skipReason: "explicit-schema-first-mode",
    });
  });
});

describe("loadProjectDefinitions on code-first and mixed packages", () => {
  it("checks a code-first family and its alias", async () => {
    const { report } = await loadFixture("control");
    expect(report.status).toBe("ok");
    expect(
      report.definitions.map(({ key, version, source }) => ({
        key,
        version,
        source,
      })),
    ).toEqual([
      {
        key: "test/invoice",
        version: 1,
        source: {
          specifier: "./src/catalog.ts",
          exportPath: ["publishedInvoice"],
        },
      },
      {
        key: "test/invoice",
        version: 2,
        source: {
          specifier: "./src/invoice.ts",
          exportPath: ["invoiceFamily", "modules", "1"],
        },
      },
    ]);
  });

  it("reads both authoring modes through one shape", async () => {
    const { report } = await loadFixture("mixed");
    expect(report.status).toBe("ok");
    expect(report.sourceSet).toMatchObject({
      mode: "code-first",
      origin: "config",
      sources: [LEDGER],
    });
    expect(report.definitions.map(({ key, source }) => [key, source])).toEqual([
      [
        "example/ledger",
        { specifier: LEDGER.specifier, exportPath: ["Ledger"] },
      ],
      ["example/wallet", WALLET],
    ]);
  });

  it("reports a stored model that claims a code-first model's documentType@version", async () => {
    const { report } = await loadFixture("mixed", {
      files: {
        "document-models/copy/copy.json": storedModel("example/ledger", "Copy"),
      },
    });
    expect(brief(report.diagnostics)).toEqual([
      {
        code: "PH-PKG-LOGICAL-COLLISION",
        source: {
          specifier: "./document-models/ledger/index.ts",
          exportPath: ["Ledger"],
        },
        path: [],
      },
    ]);
  });

  it("reports a code-first model no entry reaches, in either mode", async () => {
    const mixed = await loadFixture("mixed", {
      files: { "document-models/notes/model.ts": ORPHAN },
    });
    const stored = await loadFixture("stored", {
      files: { "document-models/notes/model.ts": ORPHAN },
    });
    for (const { project, report } of [mixed, stored]) {
      expect(project.unregistered).toEqual([
        {
          kind: "document-model",
          unit: "./document-models/notes/",
          specifier: "./document-models/notes/model.ts",
        },
      ]);
      expect(report.status).toBe("invalid");
      expect(brief(report.diagnostics)).toEqual([
        {
          code: "PH-PKG-DEFINITION-UNREGISTERED",
          source: { specifier: "./document-models/notes/model.ts" },
          path: [],
        },
      ]);
    }
  });

  it("does not scan for unregistered models when the selection is unknown", async () => {
    const { project, report } = await loadFixture("mixed", {
      configFile: "unsupported.config.json",
      files: {
        "document-models/notes/model.ts": ORPHAN,
        "unsupported.config.json":
          '{ "definitionSources": { "formatVersion": 2, "mode": "code-first", "entries": [] } }',
      },
    });
    expect(project.unregistered).toEqual([]);
    expect(report.status).toBe("failed");
    expect(brief(report.diagnostics).map(({ code }) => code)).toEqual([
      "PH-CONFIG-VERSION-UNSUPPORTED",
    ]);
  });
});

describe("reports", () => {
  it("are byte-identical across loads and carry no absolute path", async () => {
    const files = {
      "document-models/notes/model.ts": ORPHAN,
      "document-models/copy/copy.json": storedModel("example/ledger", "Copy"),
    };
    const first = await loadFixture("mixed", { files });
    const second = await loadFixture("mixed", { files });
    const serialized = ({ project, report }: typeof first) =>
      JSON.stringify({
        report,
        inspection: inspectProjectDefinitions(project),
        selected: inspectProjectDefinitions(project, {
          selection: { documentType: "example/wallet", version: 1 },
        }),
      });
    expect(serialized(second)).toBe(serialized(first));
    expect(serialized(first)).not.toContain(first.root);
    expect(first.report.summary).toEqual({ errors: 2, warnings: 0 });
  });

  it("run the checks a later layer registers with a wider input", async () => {
    type WithSubgraphs = DefinitionCheckInput & {
      readonly subgraphs: readonly string[];
    };
    const subgraphCheck: DefinitionCheck<WithSubgraphs> = {
      name: "subgraphs",
      run: ({ subgraphs, artifacts }) =>
        Promise.resolve(
          subgraphs.map((name) => ({
            code: "PH-SG-EXAMPLE",
            severity: "warning",
            phase: "composition",
            source: artifacts[0].source,
            path: [name],
            message: `${name} was checked.`,
            repair: "None.",
          })),
        ),
    };
    const { project } = await loadFixture("mixed");
    const report = await checkProjectDefinitions(
      { ...project, subgraphs: ["inventory"] },
      { checks: [...documentModelChecks, subgraphCheck] },
    );
    expect(report.status).toBe("ok");
    expect(report.summary).toEqual({ errors: 0, warnings: 1 });
    expect(brief(report.diagnostics)).toEqual([
      {
        code: "PH-SG-EXAMPLE",
        source: { specifier: LEDGER.specifier, exportPath: ["Ledger"] },
        path: ["inventory"],
      },
    ]);
  });

  it("load the producers a caller passes, at the paths each producer's author edits", async () => {
    const { project } = await loadFixture("mixed");
    const wallet = project.artifacts.find(
      ({ documentType }) => documentType === "example/wallet",
    );
    if (wallet === undefined) throw new Error("no example/wallet");
    const source = { specifier: "./readers/wallet.yaml" } as const;
    const reader: DefinitionProducer = () => ({
      artifacts: [{ ...wallet, source }],
      diagnostics: [],
      relocations: new Map([[source.specifier, (path) => ["wallet", ...path]]]),
    });
    const { report } = await loadFixture("mixed", {
      producers: [...defaultDefinitionProducers, reader],
    });
    expect(brief(report.diagnostics)).toEqual([
      { code: "PH-PKG-LOGICAL-COLLISION", source, path: ["wallet"] },
    ]);
    expect(report.diagnostics[0].related).toMatchObject([
      { source: WALLET, path: [] },
    ]);
  });

  it("list inventory entries a later layer checked, in the artifact order", async () => {
    const { project } = await loadFixture("mixed");
    const report = await checkProjectDefinitions(project, {
      definitions: [
        {
          kind: "subgraph",
          key: "example/ledger",
          source: { specifier: "./subgraphs/ledger/index.ts" },
        },
        {
          kind: "subgraph",
          key: "accounts",
          source: { specifier: "./subgraphs/accounts/index.ts" },
        },
      ],
    });
    expect(
      report.definitions.map(({ kind, key, source }) => [
        kind,
        key,
        source.specifier,
      ]),
    ).toEqual([
      ["subgraph", "accounts", "./subgraphs/accounts/index.ts"],
      ["subgraph", "example/ledger", "./subgraphs/ledger/index.ts"],
      ["document-model", "example/ledger", LEDGER.specifier],
      ["document-model", "example/wallet", WALLET.specifier],
    ]);
  });
});
