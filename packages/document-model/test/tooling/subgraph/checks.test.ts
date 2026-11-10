import type {
  DefinitionCheckReport,
  DefinitionDiagnostic,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ph } from "../../../src/definition/index.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import type { NormalizedDocumentModelArtifact } from "../../../src/definition/tooling/adapters/types.js";
import {
  checkProjectDefinitions,
  documentModelChecks,
} from "../../../src/definition/tooling/check/check-project-definitions.js";
import { subgraphChecks } from "../../../src/definition/tooling/subgraph/checks.js";
import {
  subgraphCheckInput,
  type SubgraphHostConflict,
} from "../../../src/definition/tooling/subgraph/input.js";
import { readSubgraphDefinitions } from "../../../src/definition/tooling/subgraph/read.js";
import type { SchemaFirstSubgraphSource } from "../../../src/definition/tooling/subgraph/schema-first/sdl-conflicts.js";
import {
  type Builders,
  codeFirst,
  sourceSet,
  storedArtifact,
} from "./fixture.js";

const Item = ph.object("Item", {
  fields: { id: ph.OID({ required: true }), label: ph.String() },
});
const ItemFilter = ph.input("ItemFilter", {
  fields: { label: ph.String() },
});

const itemsSubgraph = codeFirst("items", (schema) => [
  schema.query("items", {
    args: { filter: ph.ref(ItemFilter) },
    type: ph.list(ph.ref(Item, { required: true }), { required: true }),
    resolve: () => [],
  }),
]);

type Project = {
  readonly exports: object;
  readonly artifacts?: readonly NormalizedDocumentModelArtifact[];
  readonly schemaFirst?: readonly SchemaFirstSubgraphSource[];
  readonly scalars?: object | null;
  readonly hostConflicts?: readonly SubgraphHostConflict[];
};

async function check(project: Project): Promise<DefinitionCheckReport> {
  const { input, inventory } = subgraphCheckInput({
    definitions: readSubgraphDefinitions(project.exports),
    ...(project.schemaFirst !== undefined && {
      schemaFirst: project.schemaFirst,
    }),
    ...(project.scalars !== undefined && { scalars: project.scalars }),
    ...(project.hostConflicts !== undefined && {
      hostConflicts: project.hostConflicts,
    }),
  });
  return await checkProjectDefinitions(
    {
      sourceSet: sourceSet(),
      artifacts: project.artifacts ?? [],
      unregistered: [],
      diagnostics: [],
      skipReason: "no-document-models",
      subgraphs: input,
    },
    {
      checks: [...documentModelChecks, ...subgraphChecks],
      definitions: inventory,
    },
  );
}

const summary = (diagnostics: readonly DefinitionDiagnostic[]) =>
  diagnostics.map(({ code, severity, source, path, received }) => ({
    code,
    severity,
    exportPath: source?.exportPath,
    path,
    received,
  }));

describe("subgraphChecks through checkProjectDefinitions", () => {
  it("stays skipped when the module exports no code-first subgraph", async () => {
    const report = await check({ exports: {} });
    expect(report.status).toBe("skipped");
  });

  it("reports two code-first subgraphs with one name", async () => {
    const twin = codeFirst("items", (schema) => [
      schema.query("otherItems", { type: ph.String(), resolve: () => null }),
    ]);
    const report = await check({ exports: { A: itemsSubgraph, B: twin } });
    expect(report.status).toBe("invalid");
    expect(summary(report.diagnostics)).toEqual([
      {
        code: "PH-SG-DUPLICATE-NAME",
        severity: "error",
        exportPath: ["B"],
        path: ["name"],
        received: "items",
      },
    ]);
    expect(report.diagnostics[0].related).toEqual([
      {
        source: { specifier: "./subgraphs/index.ts", exportPath: ["A"] },
        path: ["name"],
        message: "The other subgraph named items.",
      },
    ]);
  });

  it("reports a root field two code-first subgraphs serve, and a type they define differently", async () => {
    const OtherItem = ph.object("Item", {
      fields: { id: ph.OID({ required: true }), price: ph.Float() },
    });
    const clash = codeFirst("clash", (schema) => [
      schema.query("items", { type: ph.String(), resolve: () => null }),
      schema.query("cheapest", {
        type: ph.ref(OtherItem),
        resolve: () => null,
      }),
    ]);
    const report = await check({ exports: { A: itemsSubgraph, B: clash } });
    expect(report.status).toBe("invalid");
    expect(summary(report.diagnostics)).toEqual([
      {
        code: "PH-SG-TYPE-CONFLICT",
        severity: "error",
        exportPath: ["B"],
        path: ["entries", 0],
        received: "Query.items",
      },
      {
        code: "PH-SG-TYPE-CONFLICT",
        severity: "error",
        exportPath: ["B"],
        path: ["types", 0],
        received: "Item",
      },
    ]);
  });

  it("accepts one type that two subgraphs share, whatever the description or field order", async () => {
    const reordered = ph.object("Item", {
      description: "The same item, described.",
      fields: { label: ph.String(), id: ph.OID({ required: true }) },
    });
    const shared = (name: string, type: typeof Item) =>
      codeFirst(name, (schema: Builders) => [
        schema.query(name, { type: ph.ref(type), resolve: () => null }),
      ]);
    const report = await check({
      exports: { A: shared("first", Item), B: shared("second", reordered) },
    });
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe("ok");
  });

  it("reports code-first subgraphs a host refuses by name or by a type it owns", async () => {
    const Operation = ph.object("Operation", { fields: { id: ph.OID() } });
    const report = await check({
      exports: {
        System: codeFirst("system", (schema) => [
          schema.query("ping", { type: ph.String(), resolve: () => null }),
        ]),
        Invoice: codeFirst("invoice", (schema) => [
          schema.query("pong", { type: ph.String(), resolve: () => null }),
        ]),
        Ops: codeFirst("ops", (schema) => [
          schema.query("op", { type: ph.ref(Operation), resolve: () => null }),
        ]),
      },
      artifacts: [storedArtifact("acme/invoice", "Invoice")],
      hostConflicts: [
        { subgraph: "system", nameHeldBy: "core", claims: [] },
        { subgraph: "invoice", nameHeldBy: "document model", claims: [] },
        {
          subgraph: "ops",
          claims: [
            { claim: "Operation", owner: "r" },
            { claim: "Invoice", owner: "invoice" },
          ],
        },
      ],
    });
    expect(report.status).toBe("invalid");
    expect(summary(report.diagnostics)).toEqual([
      {
        code: "PH-SG-NAME-RESERVED",
        severity: "error",
        exportPath: ["Invoice"],
        path: [],
        received: "invoice",
      },
      {
        code: "PH-SG-HOST-TYPE-CONFLICT",
        severity: "error",
        exportPath: ["Ops"],
        path: ["types", 0],
        received: "Operation",
      },
      {
        code: "PH-SG-NAME-RESERVED",
        severity: "error",
        exportPath: ["System"],
        path: [],
        received: "system",
      },
    ]);
  });

  it("reports a type a document model of the package generates", async () => {
    const artifact = storedArtifact("acme/invoice", "Invoice");
    const InvoiceState = ph.object("Invoice_InvoiceState", {
      fields: { title: ph.String() },
    });
    const Invoice = ph.object("Invoice", { fields: { id: ph.OID() } });
    const clash = codeFirst("invoices", (schema) => [
      schema.query("invoice", {
        type: ph.ref(Invoice),
        resolve: () => null,
      }),
      schema.query("state", {
        type: ph.ref(InvoiceState),
        resolve: () => null,
      }),
      schema.query("plain", { type: ph.ref(Item), resolve: () => null }),
    ]);
    const report = await check({
      exports: { Invoices: clash },
      artifacts: [artifact],
    });
    expect(report.status).toBe("invalid");
    expect(summary(report.diagnostics)).toEqual([
      {
        code: "PH-SG-DOCUMENT-MODEL-TYPE-CONFLICT",
        severity: "error",
        exportPath: ["Invoices"],
        path: ["types", 0],
        received: "Invoice",
      },
      {
        code: "PH-SG-DOCUMENT-MODEL-TYPE-CONFLICT",
        severity: "error",
        exportPath: ["Invoices"],
        path: ["types", 1],
        received: "Invoice_InvoiceState",
      },
    ]);
    expect(report.diagnostics[0].related).toEqual([
      {
        source: { specifier: "./document-models/invoice/model.json" },
        path: [],
        message: "acme/invoice generates Invoice.",
      },
    ]);
  });

  describe("package scalars", () => {
    const Iban = defineScalar({ name: "Iban", schema: z.string() });
    const Account = ph.object("Account", { fields: { iban: ph.scalar(Iban) } });
    const accounts = codeFirst("accounts", (schema) => [
      schema.query("account", { type: ph.ref(Account), resolve: () => null }),
    ]);

    it("reports a package scalar scalars/index.ts does not export, or exports under another name", async () => {
      for (const scalars of [null, {}, { IBAN: Iban }]) {
        const report = await check({
          exports: { Accounts: accounts },
          scalars,
        });
        expect(report.status).toBe("invalid");
        expect(summary(report.diagnostics)).toEqual([
          {
            code: "PH-SG-SCALAR-UNREGISTERED",
            severity: "error",
            exportPath: ["Accounts"],
            path: ["scalars", 0],
            received: "Iban",
          },
        ]);
      }
    });
  });
});
