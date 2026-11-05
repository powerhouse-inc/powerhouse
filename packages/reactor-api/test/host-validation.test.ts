import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { defineScalar } from "document-model/scalars";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { documentModelSchemaSource } from "../src/graphql/document-model-schema/source.js";
import { StitchingGatewayAdapter } from "../src/graphql/gateway/adapter-gateway-stitching.js";
import {
  type HostValidationFinding,
  validateDocumentModelsForHost,
} from "../src/packages/host-validation.js";
import { scalarExportsOf } from "../src/packages/scalar-exports.js";
import { buildScalarRegistry } from "../src/packages/scalar-registry.js";
import type { ScalarRegistry } from "../src/utils/scalar-types.js";
import {
  asStored,
  Bic,
  boardModel,
  Iban,
  ledgerModel,
} from "./utils/code-first-models.js";
import {
  makeDriveModule,
  makeHarness,
  makeHarnessLogger,
  makeMockReactorClient,
} from "./utils/graphql-manager-harness.js";

const PACKAGE = "@acme/banking";

/** The registry the host builds from one package's `scalars` entry. */
const registry = (scalars: Readonly<Record<string, unknown>>): ScalarRegistry =>
  buildScalarRegistry(new Map([[PACKAGE, scalarExportsOf(scalars)]])).registry;

const OtherIban = defineScalar({
  name: "Iban",
  description: "Another account number.",
  schema: z.string(),
});

type Module = DocumentModelModule & { definition: Record<string, unknown> };

/** The ledger with a definition whose format version no host reads. */
function invalidLedger(): DocumentModelModule {
  const module = ledgerModel() as Module;
  return {
    ...module,
    definition: { ...module.definition, formatVersion: 2 },
  } as DocumentModelModule;
}

/** The ledger's module renamed, so its definition describes another type. */
function renamedLedger(id: string): DocumentModelModule {
  const module = ledgerModel();
  return {
    ...module,
    documentModel: {
      ...module.documentModel,
      global: { ...module.documentModel.global, id },
    },
  } as DocumentModelModule;
}

const wire = (finding: HostValidationFinding | undefined) =>
  finding !== undefined && "diagnostics" in finding
    ? finding.diagnostics.map(({ code, path }) => ({ code, path }))
    : finding;

describe("validateDocumentModelsForHost", () => {
  it("finds nothing in models whose package scalars are bound, or that are served from their stored SDL", () => {
    expect(
      validateDocumentModelsForHost(
        [makeDriveModule(), asStored(boardModel()), ledgerModel()],
        registry({ Iban }),
      ),
    ).toEqual({ findings: [] });
  });

  it("finds a package scalar no package binds", () => {
    expect(
      validateDocumentModelsForHost([boardModel()], registry({ Iban })),
    ).toEqual({
      findings: [
        { kind: "scalar-unbound", documentType: "test/board", scalar: "Bic" },
      ],
    });
  });

  it("finds a package scalar bound with other stored metadata", () => {
    expect(
      validateDocumentModelsForHost(
        [boardModel()],
        registry({ Iban: OtherIban, Bic }),
      ),
    ).toEqual({
      findings: [
        {
          kind: "scalar-mismatch",
          documentType: "test/board",
          scalar: "Iban",
          packageName: PACKAGE,
          declared:
            '{"coercion":{"source":"derived"},"coercionProfile":"catalog-v1","description":"An international bank account number.","formatVersion":1,"kind":"powerhouse.scalar","name":"Iban","representation":"string"}',
          registered:
            '{"coercion":{"source":"derived"},"coercionProfile":"catalog-v1","description":"Another account number.","formatVersion":1,"kind":"powerhouse.scalar","name":"Iban","representation":"string"}',
        },
      ],
    });
  });

  it("finds an invalid definition with its wire diagnostics, in model order", () => {
    const { findings } = validateDocumentModelsForHost(
      [invalidLedger(), boardModel()],
      registry({ Iban }),
    );
    expect(
      findings.map(({ kind, documentType }) => [kind, documentType]),
    ).toEqual([
      ["definition-invalid", "test/ledger"],
      ["scalar-unbound", "test/board"],
    ]);
    expect(wire(findings[0])).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["definition", "formatVersion"],
      },
    ]);
  });

  it("finds a definition of another document type as a mismatch", () => {
    const { findings } = validateDocumentModelsForHost(
      [renamedLedger("test/other")],
      new Map(),
    );
    expect(
      findings.map(({ kind, documentType }) => [kind, documentType]),
    ).toEqual([["definition-mismatch", "test/other"]]);
    expect(wire(findings[0])).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: ["definition", "model", "documentType"],
      },
    ]);
  });

  it("logs nothing where serving the model logs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const model = renamedLedger("test/silent");
      expect(
        validateDocumentModelsForHost([model], new Map()).findings.map(
          ({ kind }) => kind,
        ),
      ).toEqual(["definition-mismatch"]);
      expect([...warn.mock.calls, ...error.mock.calls]).toEqual([]);

      documentModelSchemaSource(model);
      expect(
        warn.mock.calls.map(([line]) =>
          String(line).replace(/^\[[\d:.]+\] /, ""),
        ),
      ).toEqual([
        `[reactor-api][document-model-schema] Serving document model test/silent from its stored model: its definition is mismatch: ${JSON.stringify(
          [
            {
              code: "PH-DM-DECLARATION-INVALID",
              severity: "error",
              phase: "definition",
              path: ["definition", "model", "documentType"],
              message:
                "The structured definition and the stored model describe different document types.",
              expected: "test/silent",
              received: "test/ledger",
              repair:
                "Materialize the module and its definition from the same declaration.",
            },
          ],
        )}`,
      ]);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });
});

let shutdown: (() => Promise<void>) | undefined;

afterEach(async () => {
  await shutdown?.();
  shutdown = undefined;
});

async function serve(
  models: readonly DocumentModelModule[],
  scalars: ScalarRegistry,
  hostValidation?: "log" | "refuse",
) {
  const logger = makeHarnessLogger();
  const { manager, mounts } = makeHarness({
    enableDocumentModelSubgraphs: true,
    logger,
    hostValidation,
    gatewayAdapter: new StitchingGatewayAdapter(logger),
    reactorClient: makeMockReactorClient({
      getDocumentModelModules: () =>
        Promise.resolve({
          results: [makeDriveModule(), ...models],
          options: { cursor: "", limit: 100 },
        }),
    }),
  });
  shutdown = () => manager.shutdown();
  await manager.init([], undefined, undefined, scalars);
  await manager.updateRouter();
  return { manager, mounts, logger };
}

const calls = (logger: ILogger, level: "warn" | "error") =>
  vi.mocked(logger[level]).mock.calls;

const served = (mounts: ReadonlyMap<string, unknown>) =>
  ["/graphql/board", "/graphql/ledger"].filter((path) => mounts.has(path));

describe("host admission", () => {
  it("refuses a model with a scalar finding and serves the rest", async () => {
    const { manager, mounts, logger } = await serve(
      [boardModel(), ledgerModel()],
      registry({ Iban }),
      "refuse",
    );
    await manager.regenerateDocumentModelSubgraphs();
    await manager.updateRouter();

    expect(served(mounts)).toEqual(["/graphql/ledger"]);
    expect(calls(logger, "error")).toEqual([
      [
        "Refusing version 1 of document model @documentType from the GraphQL schema: @reasons",
        "test/board",
        "package scalar Bic has no registered binding",
      ],
    ]);
    expect(calls(logger, "warn")).toEqual([]);
  });

  it("refuses a model whose definition is invalid instead of serving its stored SDL", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { mounts, logger } = await serve(
        [boardModel(), invalidLedger()],
        registry({ Iban, Bic }),
        "refuse",
      );
      expect(served(mounts)).toEqual(["/graphql/board"]);
      expect(calls(logger, "error")).toEqual([
        [
          "Refusing version 1 of document model @documentType from the GraphQL schema: @reasons",
          "test/ledger",
          "its definition is invalid: definition.formatVersion: This member has a fixed value.",
        ],
      ]);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
