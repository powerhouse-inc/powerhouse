import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  type ILogger,
  materialize,
  ph,
} from "document-model";
import { defineScalar, type ScalarDefinition } from "document-model/scalars";
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

  describe("a binding with the model's metadata and another validator", () => {
    const NlIban = defineScalar({
      name: "Iban",
      description: "An international bank account number.",
      schema: z.string().regex(/^NL/),
    });
    const metadata =
      '"coercion":{"source":"derived"},"coercionProfile":"catalog-v1","description":"An international bank account number.","formatVersion":1,"kind":"powerhouse.scalar","name":"Iban","representation":"string"';
    const mismatch = (packageName: string) => ({
      kind: "scalar-mismatch",
      documentType: "test/board",
      scalar: "Iban",
      packageName,
      declared: `{${metadata},"validator":{"jsonSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","pattern":"^[A-Z]{2}[0-9]{2}[A-Z0-9]+$","type":"string"}}}`,
      registered: `{${metadata},"validator":{"jsonSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","pattern":"^NL","type":"string"}}}`,
    });

    it("is a mismatch on a host where another package registers it first", () => {
      const { registry: host } = buildScalarRegistry(
        new Map([
          ["@other/pkg", scalarExportsOf({ Iban: NlIban })],
          [PACKAGE, scalarExportsOf({ Iban, Bic })],
        ]),
      );
      expect(validateDocumentModelsForHost([boardModel()], host)).toEqual({
        findings: [mismatch("@other/pkg")],
      });
    });

    it("is a mismatch where the package's own scalars entry exports it", () => {
      expect(
        validateDocumentModelsForHost(
          [boardModel()],
          registry({ Iban: NlIban, Bic }),
        ),
      ).toEqual({ findings: [mismatch(PACKAGE)] });
    });

    it("is no finding when the other definition validates alike", () => {
      const SameIban = defineScalar({
        name: "Iban",
        description: "An international bank account number.",
        schema: z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/),
      });
      expect(
        validateDocumentModelsForHost(
          [boardModel()],
          registry({ Iban: SameIban, Bic }),
        ),
      ).toEqual({ findings: [] });
    });
  });

  describe("a binding with the model's metadata and a check JSON Schema cannot express", () => {
    const startsWithDe = (value: string) => value.startsWith("DE");
    const startsWithNl = (value: string) => value.startsWith("NL");
    const countryCode = (check: (value: string) => boolean) =>
      defineScalar({ name: "CountryCode", schema: z.string().refine(check) });
    const DeCode = countryCode(startsWithDe);
    const model = (scalar: ScalarDefinition) =>
      materialize(
        defineDocumentModel({
          id: "test/bank",
          name: "Bank",
          description: "A bank.",
          extension: "bank",
          version: 1,
          author: { name: "Powerhouse" },
          scopes: {
            global: {
              schema: ph.object("BankState", {
                fields: { country: ph.scalar(scalar) },
              }),
              initialValue: { country: null },
            },
            local: { schema: null, initialValue: {} },
          },
        }).version({ modules: [] }),
      ) as unknown as DocumentModelModule;
    const metadata =
      '"coercion":{"source":"derived"},"coercionProfile":"catalog-v1","description":"","formatVersion":1,"kind":"powerhouse.scalar","name":"CountryCode","representation":"string"';
    const refined = (check: (value: string) => boolean) =>
      `{${metadata},"validator":{"zod":{"checks":[{"check":"custom","fn":{"function":${JSON.stringify(String(check))}},"type":"custom"}],"type":"string"}}}`;

    it("is uncomparable when the binding refines the other way", () => {
      const NlCode = countryCode(startsWithNl);
      expect(DeCode.schema.safeParse("DE00").success).toBe(true);
      expect(NlCode.schema.safeParse("DE00").success).toBe(false);

      expect(
        validateDocumentModelsForHost(
          [model(DeCode)],
          registry({ CountryCode: NlCode }),
        ),
      ).toEqual({
        findings: [
          {
            kind: "scalar-uncomparable",
            documentType: "test/bank",
            scalar: "CountryCode",
            packageName: PACKAGE,
            declared: refined(startsWithDe),
            registered: refined(startsWithNl),
          },
        ],
      });
    });

    it("is no finding when the host binds the scalar the model was compiled with", () => {
      expect(
        validateDocumentModelsForHost(
          [model(DeCode)],
          registry({ CountryCode: DeCode }),
        ),
      ).toEqual({ findings: [] });
    });

    it("is no finding for another definition with the same check", () => {
      expect(
        validateDocumentModelsForHost(
          [model(DeCode)],
          registry({ CountryCode: countryCode(startsWithDe) }),
        ),
      ).toEqual({ findings: [] });
    });

    it("is a mismatch when object scalars differ in a field named error", () => {
      const StringError = defineScalar({
        name: "CountryCode",
        schema: z.object({ error: z.string() }),
      });
      const NumberError = defineScalar({
        name: "CountryCode",
        schema: z.object({ error: z.number() }),
      });
      const { findings } = validateDocumentModelsForHost(
        [model(StringError)],
        registry({ CountryCode: NumberError }),
      );
      expect(findings.map(({ kind }) => kind)).toStrictEqual([
        "scalar-mismatch",
      ]);
    });

    it("is uncomparable when the checks differ only where JSON Schema drops them", () => {
      const host = (hostname: RegExp) =>
        defineScalar({ name: "Site", schema: z.url({ hostname }) });
      const siteModel = materialize(
        defineDocumentModel({
          id: "test/site",
          name: "Site",
          description: "A site.",
          extension: "site",
          version: 1,
          author: { name: "Powerhouse" },
          scopes: {
            global: {
              schema: ph.object("SiteState", {
                fields: { url: ph.scalar(host(/^a\.example$/)) },
              }),
              initialValue: { url: null },
            },
            local: { schema: null, initialValue: {} },
          },
        }).version({ modules: [] }),
      ) as unknown as DocumentModelModule;

      expect(
        validateDocumentModelsForHost(
          [siteModel],
          registry({ Site: host(/^b\.example$/) }),
        ).findings.map(({ kind }) => kind),
      ).toEqual(["scalar-uncomparable"]);
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
