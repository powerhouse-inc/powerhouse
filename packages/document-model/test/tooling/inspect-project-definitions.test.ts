import { describe, expect, it } from "vitest";
import { inspectProjectDefinitions } from "../../src/definition/tooling/inspect/inspect-project-definitions.js";
import { loadFixture, storedModel } from "./project-fixtures.js";

const WALLET_VERSION = {
  version: 1,
  source: { specifier: "./document-models/wallet/wallet.json" },
  scopes: { global: "WalletState", local: null },
  modules: [
    {
      key: "funds",
      name: "funds",
      operations: [
        {
          key: "setBalance",
          name: "SET_BALANCE",
          actionType: "SET_BALANCE",
          scope: "global",
          input: "SetBalanceInput",
          errors: [{ key: "WalletFrozen", code: "WALLET_FROZEN" }],
        },
      ],
    },
  ],
  scalars: [
    { name: "Amount_Money", implementation: "powerhouse.catalog#Amount_Money" },
    { name: "Iban", implementation: "package#Iban" },
  ],
  types: ["WalletState"],
};

const WALLET_FAMILY = {
  documentType: "example/wallet",
  name: "Wallet",
  extension: ".wallet",
  compatibility: {
    identity: "explicit-schema-first",
    scalarCoercion: "catalog-v1",
    serialization: "explicit-schema-first",
  },
  versions: [WALLET_VERSION],
};

describe("inspectProjectDefinitions", () => {
  it("describes a schema-first model, its project scalar included", async () => {
    const { project } = await loadFixture("stored");
    const report = inspectProjectDefinitions(project);
    expect(report).toEqual({
      kind: "powerhouse.definition-inspection",
      formatVersion: 1,
      status: "ok",
      sourceSet: project.sourceSet,
      families: [{ ...WALLET_FAMILY, digest: project.artifacts[0].digest }],
      diagnostics: [],
    });
  });

  it("describes each served version of a code-first family under one digest", async () => {
    const { project } = await loadFixture("control");
    const { status, families } = inspectProjectDefinitions(project);
    expect(status).toBe("ok");
    expect(
      families.map(({ documentType, digest, compatibility, versions }) => ({
        documentType,
        digest,
        identity: compatibility.identity,
        versions: versions.map(({ version, source, modules }) => ({
          version,
          source,
          operations: modules.flatMap(({ operations }) =>
            operations.map(({ key, actionType, input }) => [
              key,
              actionType,
              input,
            ]),
          ),
        })),
      })),
    ).toEqual([
      {
        documentType: "test/invoice",
        digest: project.artifacts[0].digest,
        identity: "derived-v1",
        versions: [
          {
            version: 1,
            source: {
              specifier: "./src/catalog.ts",
              exportPath: ["publishedInvoice"],
            },
            operations: [["setTitle", "SET_TITLE", "SetTitleInput"]],
          },
          {
            version: 2,
            source: {
              specifier: "./src/invoice.ts",
              exportPath: ["invoiceFamily", "modules", "1"],
            },
            operations: [["setTitle", "SET_TITLE", "SetTitleInput"]],
          },
        ],
      },
    ]);
  });

  it("describes a mixed package and returns the selected model's definition", async () => {
    const { project } = await loadFixture("mixed");
    expect(
      inspectProjectDefinitions(project).families.map(
        ({ documentType, versions: [{ scalars, modules }] }) => ({
          documentType,
          scalars,
          errors: modules[0].operations[0].errors,
        }),
      ),
    ).toEqual([
      {
        documentType: "example/ledger",
        scalars: [{ name: "Iban", implementation: "package#Iban" }],
        errors: [{ key: "Overdrawn", code: "OVERDRAWN" }],
      },
      {
        documentType: "example/wallet",
        scalars: WALLET_VERSION.scalars,
        errors: [{ key: "WalletFrozen", code: "WALLET_FROZEN" }],
      },
    ]);

    const selected = inspectProjectDefinitions(project, {
      selection: { documentType: "example/wallet", version: 1 },
    });
    const wallet = project.artifacts[1];
    expect(selected).toEqual({
      kind: "powerhouse.definition-inspection",
      formatVersion: 1,
      status: "ok",
      sourceSet: project.sourceSet,
      families: [{ ...WALLET_FAMILY, digest: wallet.digest }],
      diagnostics: [],
      definition: wallet.definition,
    });
  });

  it("lists what is available when the selection matches nothing", async () => {
    const { project } = await loadFixture("mixed");
    expect(
      inspectProjectDefinitions(project, {
        selection: { documentType: "example/wallet", version: 2 },
      }),
    ).toEqual({
      kind: "powerhouse.definition-inspection",
      formatVersion: 1,
      status: "failed",
      sourceSet: project.sourceSet,
      families: [],
      diagnostics: [
        {
          code: "PH-INSPECT-SELECTION-UNKNOWN",
          severity: "error",
          phase: "configuration",
          path: ["selection"],
          message: "No model of this package serves example/wallet@2.",
          expected: "example/ledger@1, example/wallet@1",
          received: "example/wallet@2",
          repair: "Inspect one of: example/ledger@1, example/wallet@1.",
        },
      ],
    });
  });

  it("caps the available list", async () => {
    const files = Object.fromEntries(
      Array.from({ length: 22 }, (_, index) => {
        const name = `m${String(index).padStart(2, "0")}`;
        return [
          `document-models/${name}/${name}.json`,
          storedModel(`test/${name}`, `M${name}`),
        ];
      }),
    );
    const { project } = await loadFixture("stored", { files });
    const [diagnostic] = inspectProjectDefinitions(project, {
      selection: { documentType: "test/none", version: 1 },
    }).diagnostics;
    const listed = Array.from(
      { length: 19 },
      (_, index) => `test/m${String(index).padStart(2, "0")}@1`,
    );
    expect(diagnostic.expected).toBe(
      `example/wallet@1, ${listed.join(", ")}, and 3 more`,
    );
  });

  it("keeps a skipped selection skipped", async () => {
    const { project } = await loadFixture("schema-first");
    expect(inspectProjectDefinitions(project)).toMatchObject({
      status: "skipped",
      families: [],
      diagnostics: [],
    });
  });
});

describe("inspectProjectDefinitions with an ambiguous selection", () => {
  it("reports the collision and returns no definition", async () => {
    const { project } = await loadFixture("mixed", {
      files: {
        "document-models/copy/copy.json": storedModel(
          "example/ledger",
          "Ledger",
        ),
      },
    });
    const report = inspectProjectDefinitions(project, {
      selection: { documentType: "example/ledger", version: 1 },
    });
    expect(report).not.toHaveProperty("definition");
    expect(report.status).toBe("invalid");
    expect(
      report.families.map(({ documentType, versions }) => ({
        documentType,
        sources: versions.map(({ source }) => source),
      })),
    ).toEqual([
      {
        documentType: "example/ledger",
        sources: [{ specifier: "./document-models/copy/copy.json" }],
      },
      {
        documentType: "example/ledger",
        sources: [
          {
            specifier: "./document-models/ledger/index.ts",
            exportPath: ["Ledger"],
          },
        ],
      },
    ]);
    expect(report.diagnostics).toEqual([
      {
        code: "PH-PKG-LOGICAL-COLLISION",
        severity: "error",
        phase: "package",
        source: {
          specifier: "./document-models/ledger/index.ts",
          exportPath: ["Ledger"],
        },
        definition: {
          kind: "document-model",
          key: "example/ledger",
          version: 1,
        },
        path: [],
        message:
          "Two sources claim example/ledger@1, and a host registers one module per document type and version.",
        expected: "one source for example/ledger@1",
        received:
          "./document-models/copy/copy.json and ./document-models/ledger/index.ts",
        repair:
          "Keep one of the two models, or give one of them another document type.",
        related: [
          {
            source: { specifier: "./document-models/copy/copy.json" },
            path: [],
            message: "This source also claims example/ledger@1.",
          },
        ],
      },
    ]);
  });
});
