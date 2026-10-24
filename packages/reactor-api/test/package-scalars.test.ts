import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineScalar, getCatalogScalar } from "document-model/scalars";
import type * as GraphQL from "graphql";
import { parse } from "graphql";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { BaseSubgraph } from "../src/graphql/base-subgraph.js";
import { PackageManager } from "../src/packages/package-manager.js";
import {
  type ScalarExport,
  scalarExportsOf,
} from "../src/packages/scalar-exports.js";
import {
  buildScalarRegistry,
  describeScalarRefusal,
} from "../src/packages/scalar-registry.js";
import type { ISubscribablePackageLoader } from "../src/packages/types.js";
import { createSchema } from "../src/utils/create-schema.js";

// The CommonJS build @apollo/subgraph uses; vite would hand this file the ESM one.
const { graphql } = createRequire(import.meta.url)("graphql") as typeof GraphQL;

const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const VALID = "DE89370400440532013000";

const Iban = defineScalar({
  name: "Iban",
  description: "International bank account number",
  schema: z.string().regex(IBAN_PATTERN),
  example: VALID,
});

const BRAND = Symbol.for("powerhouse.scalar-definition");

function branded(name: string, version: number) {
  return {
    [BRAND]: version,
    name,
    schema: z.string(),
    typescriptType: null,
    zodSource: null,
  };
}

const registryOf = (...packages: [string, Record<string, unknown>][]) =>
  buildScalarRegistry(
    new Map(packages.map(([pkg, module]) => [pkg, scalarExportsOf(module)])),
  );

const LEDGER = {
  documentModel: {
    global: {
      id: "test/ledger",
      name: "Ledger",
      specifications: [
        {
          version: 1,
          state: {
            global: {
              schema: "scalar Iban\n\ntype LedgerState { iban: Iban }",
              initialValue: "",
            },
            local: { schema: "", initialValue: "" },
          },
          modules: [
            {
              id: "accounts",
              name: "accounts",
              description: "",
              operations: [
                {
                  id: "set-iban",
                  name: "SET_IBAN",
                  schema: "input SetIbanInput { iban: Iban! }",
                  description: "",
                  template: "",
                  reducer: "",
                  errors: [],
                  examples: [],
                  scope: "global",
                },
              ],
            },
          ],
        },
      ],
    },
  },
  actions: {
    setIban: (input: unknown) => ({ type: "SET_IBAN", input }),
  },
} as unknown as DocumentModelModule;

const messages = (result: GraphQL.ExecutionResult) =>
  (result.errors ?? []).map((error) => error.message);

describe("an object-valued registered scalar", () => {
  const Range = defineScalar({
    name: "Range",
    schema: z.object({ from: z.number(), to: z.number() }),
  });
  const { registry } = registryOf(["@acme/ranges", { Range }]);
  const schema = createSchema(
    [],
    {
      Query: {
        span: (_root: unknown, args: { range: { from: number; to: number } }) =>
          args.range.to - args.range.from,
      },
    },
    parse("type Query { span(range: Range!): Float! }"),
    { scalars: registry },
  );

  it("reads a variable nested in a literal at execution", async () => {
    const result = await graphql({
      schema,
      source: "query ($to: Float!) { span(range: { from: 1, to: $to }) }",
      variableValues: { to: 4 },
    });
    expect(result).toEqual({ data: { span: 3 } });

    const refused = await graphql({
      schema,
      source: "query ($to: String!) { span(range: { from: 1, to: $to }) }",
      variableValues: { to: "4" },
    });
    expect(messages(refused)).toEqual([
      'Argument "range" has invalid value {from: 1, to: $to}.',
    ]);
  });
});

describe("the scalar registry", () => {
  it.each([
    [
      "Int",
      "GraphQL built-in",
      "GraphQL as a built-in scalar",
      branded("Int", 1),
    ],
    ["Amount", "catalog", "the scalar catalog", getCatalogScalar("Amount")],
    [
      "Operation",
      "document-model schema",
      "the document-model schema",
      branded("Operation", 1),
    ],
  ])(
    "refuses %s, a %s name, from a package re-exporting it",
    (name, reservedBy, reserver, definition) => {
      const { registry, refusals } = registryOf([
        "@acme/bundled",
        { [name]: definition },
      ]);
      expect(registry.size).toBe(0);
      expect(refusals).toEqual([
        {
          kind: "reserved-name",
          packageName: "@acme/bundled",
          exportName: name,
          name,
          reservedBy,
        },
      ]);
      expect(refusals.map(describeScalarRefusal)).toEqual([
        `Export ${name} of package @acme/bundled is refused: the name ${name} is reserved by ${reserver}.`,
      ]);
    },
  );

  it("accepts the same definition from two packages", () => {
    const { registry, refusals } = registryOf(
      ["@acme/banking", { Iban }],
      ["@acme/payments", { Iban }],
    );
    expect(registry.get("Iban")?.packageName).toBe("@acme/banking");
    expect(refusals).toEqual([]);
  });
});

class LookupSubgraph extends BaseSubgraph {
  name = "iban-lookup";
}

function packageLoader(
  scalars: (pkg: string) => Promise<ScalarExport[]>,
): ISubscribablePackageLoader {
  return {
    name: "fixture-loader",
    loadDocumentModels: () => Promise.resolve([LEDGER]),
    loadSubgraphs: () =>
      Promise.resolve([LookupSubgraph] as unknown as SubgraphClass[]),
    loadScalars: scalars,
    loadProcessors: () => Promise.resolve(null),
    loadPieces: () => Promise.resolve([]),
  };
}

describe("the package manager's scalars", () => {
  let warnings: string[];

  beforeEach(() => {
    warnings = [];
    vi.spyOn(console, "warn").mockImplementation((...parts: unknown[]) => {
      warnings.push(parts.map(String).join(" "));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const scalarWarnings = () =>
    warnings.filter((line) => line.includes("scalar"));

  it("refuses a version 2 definition and still loads the package's models and subgraphs", async () => {
    const manager = new PackageManager(
      [
        packageLoader(() =>
          Promise.resolve(scalarExportsOf({ Iban: branded("Iban", 2) })),
        ),
      ],
      { packages: ["@acme/banking"] },
    );
    const result = await manager.init();
    expect(result.documentModels).toContain(LEDGER);
    expect(result.subgraphs.get("@acme/banking")).toEqual([LookupSubgraph]);
    expect(manager.getScalarRegistry().size).toBe(0);
    expect(scalarWarnings()).toEqual([
      expect.stringContaining(
        "Failed to load scalars from @acme/banking:\n  Export Iban of package @acme/banking is refused: its scalar definition format version 2 is not supported; this host supports version 1.",
      ),
    ]);
  });

  it("names both packages when a second one exports another Iban", async () => {
    const OtherIban = defineScalar({ name: "Iban", schema: z.string() });
    const manager = new PackageManager(
      [
        packageLoader((pkg) =>
          Promise.resolve(
            scalarExportsOf({
              Iban: pkg === "@acme/banking" ? Iban : OtherIban,
            }),
          ),
        ),
      ],
      { packages: ["@acme/banking", "@acme/payments"] },
    );
    await manager.init();
    expect(manager.getScalarRegistry().get("Iban")?.packageName).toBe(
      "@acme/banking",
    );
    expect(scalarWarnings()).toEqual([
      expect.stringContaining(
        "Failed to load scalars from @acme/payments:\n  Scalar Iban of package @acme/payments is refused: package @acme/banking already registers a different Iban.",
      ),
    ]);
  });

  it("reports refusals the way it reports a failed subgraph load, and loads the rest", async () => {
    const Query = defineScalar({ name: "Query", schema: z.string() });
    const Bic = defineScalar({ name: "Bic", schema: z.string() });
    const manager = new PackageManager(
      [
        {
          ...packageLoader(() =>
            Promise.resolve(scalarExportsOf({ IBAN: Iban, Query, Bic })),
          ),
          loadSubgraphs: () => Promise.reject(new Error("boom in subgraphs")),
        },
      ],
      { packages: ["@acme/banking"] },
    );

    const result = await manager.init();

    expect(result.documentModels).toContain(LEDGER);
    expect(Array.from(manager.getScalarRegistry().keys())).toEqual(["Bic"]);
    expect(warnings.filter((line) => line.includes("Failed to load"))).toEqual([
      expect.stringContaining(
        "Failed to load subgraphs from @acme/banking:\n  [fixture-loader] boom in subgraphs",
      ),
      expect.stringContaining(
        [
          "Failed to load scalars from @acme/banking:",
          "  Scalar Iban of package @acme/banking is refused: it is exported as IBAN, and the export name must equal the scalar name.",
          "  Export Query of package @acme/banking is refused: the name Query is reserved by the document-model schema.",
        ].join("\n"),
      ),
    ]);
  });

  it("keeps package load order for a duplicate name when a package's scalars reload", async () => {
    vi.useFakeTimers();
    const OtherIban = defineScalar({ name: "Iban", schema: z.string() });
    const exported = new Map<string, Record<string, unknown>>([
      ["@acme/banking", { Iban }],
      ["@acme/payments", { Iban: OtherIban }],
    ]);
    const reload = new Map<string, () => void>();
    const loader: ISubscribablePackageLoader = {
      ...packageLoader((pkg) =>
        Promise.resolve(scalarExportsOf(exported.get(pkg) ?? {})),
      ),
      onScalarsChange: (pkg, handler) => {
        reload.set(pkg, () => handler([]));
        return () => undefined;
      },
    };
    const manager = new PackageManager([loader], {
      packages: ["@acme/banking", "@acme/payments"],
    });
    await manager.init();
    const reloaded = async (pkg: string, module: Record<string, unknown>) => {
      exported.set(pkg, module);
      reload.get(pkg)?.();
      await vi.advanceTimersByTimeAsync(1000);
      return manager.getScalarRegistry().get("Iban")?.packageName;
    };

    expect(await reloaded("@acme/banking", {})).toBe("@acme/payments");
    expect(await reloaded("@acme/banking", { Iban })).toBe("@acme/banking");
    expect(await reloaded("@acme/payments", { Iban: OtherIban })).toBe(
      "@acme/banking",
    );
  });

  it("reports a refusal once across reloads", async () => {
    const manager = new PackageManager(
      [packageLoader(() => Promise.resolve(scalarExportsOf({ IBAN: Iban })))],
      { packages: ["@acme/banking"] },
    );
    await manager.init();
    await manager.init();
    expect(scalarWarnings()).toEqual([
      expect.stringContaining(
        "Failed to load scalars from @acme/banking:\n  Scalar Iban of package @acme/banking is refused: it is exported as IBAN, and the export name must equal the scalar name.",
      ),
    ]);
  });
});
