import type {
  DefinitionDiagnostic,
  DefinitionSource,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineDocumentModel,
  inspectDocumentModelDefinition,
  materialize,
  ph,
} from "../../index.js";
import { defineScalar } from "../../scalars.js";
import { canonicalDigest } from "../../src/definition/kernel/primitives.js";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/tooling/adapters/code-first-document-model-source-adapter.js";
import type { NormalizedDocumentModelArtifact } from "../../src/definition/tooling/adapters/types.js";
import {
  checkProjectDefinitions,
  documentModelChecks,
} from "../../src/definition/tooling/check/check-project-definitions.js";
import type { DefinitionSourceSet } from "../../src/definition/tooling/definition-source-types.js";
import { releaseChecks } from "../../src/definition/tooling/release/release-checks.js";
import type {
  HostValidationEvidence,
  HostValidationFindingData,
} from "../../src/definition/tooling/release/types.js";

const V1: DefinitionSource = { specifier: "./src/ledger-v1.ts" };
const V2: DefinitionSource = { specifier: "./src/ledger-v2.ts" };

const Iban = defineScalar({
  name: "Iban",
  description: "An account number.",
  schema: z.string(),
});

function sourceSet(...sources: DefinitionSource[]): DefinitionSourceSet {
  const value = { mode: "code-first", origin: "config", sources } as const;
  return { ...value, digest: canonicalDigest(value) };
}

/** A ledger module; `iban` adds the package scalar to its state. */
function ledgerModule(version: number, iban: boolean) {
  const model = defineDocumentModel({
    id: "test/ledger",
    name: "Ledger",
    description: "",
    extension: ".ledger",
    version,
    author: { name: "Fixture", website: null },
    scopes: {
      global: {
        schema: ph.object("LedgerState", {
          fields: {
            total: ph.Int({ required: true }),
            ...(iban && { iban: ph.scalar(Iban) }),
          },
        }),
        initialValue: { total: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const entries = model.module("entries", {
    operations: ({ global }) => ({
      addAmount: global({
        input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
        reduce(state, input) {
          state.total += input.amount;
        },
      }),
    }),
  });
  return materialize(model.version({ modules: [entries] }));
}

function artifact(
  module: unknown,
  source: DefinitionSource,
): NormalizedDocumentModelArtifact {
  const result = adaptCodeFirstDocumentModelSource(module, source);
  expect(result.diagnostics).toEqual([]);
  return result.artifacts[0];
}

/** Version 1 without the scalar and version 2 with it. */
const artifacts = [
  artifact(ledgerModule(1, false), V1),
  artifact(ledgerModule(2, true), V2),
];

async function release(
  host: HostValidationEvidence,
  over: readonly NormalizedDocumentModelArtifact[] = artifacts,
) {
  const [check] = releaseChecks;
  return check.run({
    sourceSet: sourceSet(V1, V2),
    artifacts: over,
    unregistered: [],
    release: { host },
  });
}

const found = (...findings: HostValidationFindingData[]) => ({
  completed: true as const,
  findings,
});

/** The wire diagnostics a host's inspection reports for a module. */
function wireDiagnostics(module: unknown): readonly DefinitionDiagnostic[] {
  const inspection = inspectDocumentModelDefinition(
    module as Parameters<typeof inspectDocumentModelDefinition>[0],
  );
  if (!("diagnostics" in inspection)) throw new Error(inspection.kind);
  return inspection.diagnostics;
}

describe("host-validation", () => {
  it("reports an unbound package scalar at the specification that declares it", async () => {
    expect(
      await release(
        found({
          kind: "scalar-unbound",
          documentType: "test/ledger",
          scalar: "Iban",
        }),
      ),
    ).toEqual([
      {
        code: "PH-REL-HOST-SCALAR-UNBOUND",
        severity: "error",
        phase: "package",
        source: V2,
        definition: { kind: "scalar", key: "Iban" },
        path: ["specifications", 0, "scalars", 0],
        message:
          "test/ledger declares package scalar Iban, but the package registers no binding for it, so a host serves Iban values without validating them.",
        expected: "an export named Iban in the package's scalars entry",
        received: "no binding",
        repair:
          "Export the defineScalar binding the model uses from scalars/index.ts under the name Iban.",
      },
    ]);
  });

  it("reports a mismatched package scalar with both stored metadata", async () => {
    const declared = '{"name":"Iban","description":"An account number."}';
    const registered = '{"name":"Iban","description":"Another number."}';
    expect(
      await release(
        found({
          kind: "scalar-mismatch",
          documentType: "test/ledger",
          scalar: "Iban",
          packageName: "@acme/ledger",
          declared,
          registered,
        }),
      ),
    ).toEqual([
      {
        code: "PH-REL-HOST-SCALAR-MISMATCH",
        severity: "error",
        phase: "package",
        source: V2,
        definition: { kind: "scalar", key: "Iban" },
        path: ["specifications", 0, "scalars", 0],
        message:
          "test/ledger declares package scalar Iban differently from the binding package @acme/ledger registers, and a host serves the registered binding.",
        expected: declared,
        received: registered,
        repair:
          "Use the Iban binding that scalars/index.ts exports in the model, so the model and the package declare one Iban.",
      },
    ]);
  });

  it("reports an invalid definition with the host's wire diagnostics", async () => {
    const module = ledgerModule(1, false);
    const diagnostics = wireDiagnostics({
      ...module,
      definition: { ...module.definition, formatVersion: 2 },
    });
    expect(diagnostics.map(({ code }) => code)).toEqual([
      "PH-DM-DECLARATION-INVALID",
    ]);
    const [wire] = diagnostics;
    expect(
      await release(
        found({
          kind: "definition-invalid",
          documentType: "test/ledger",
          diagnostics,
        }),
      ),
    ).toEqual([
      {
        code: "PH-REL-HOST-DEFINITION-INVALID",
        severity: "error",
        phase: "definition",
        source: V1,
        definition: { kind: "document-model", key: "test/ledger", version: 1 },
        path: [],
        message:
          "A host serves test/ledger from its stored SDL, because the module's definition fails the wire shape.",
        repair: wire.repair,
        related: [
          {
            source: V2,
            path: [],
            message: "This version of test/ledger carries the same definition.",
          },
          {
            path: ["definition", "formatVersion"],
            message: `PH-DM-DECLARATION-INVALID: ${wire.message}`,
          },
        ],
      },
    ]);
  });

  it("reports a definition of another document type as a mismatch", async () => {
    const module = ledgerModule(1, false);
    const diagnostics = wireDiagnostics({
      ...module,
      documentModel: {
        ...module.documentModel,
        global: { ...module.documentModel.global, id: "test/other" },
      },
    });
    const [wire] = diagnostics;
    expect(
      await release(
        found({
          kind: "definition-mismatch",
          documentType: "test/other",
          diagnostics,
        }),
      ),
    ).toEqual([
      {
        code: "PH-REL-HOST-DEFINITION-MISMATCH",
        severity: "error",
        phase: "definition",
        definition: { kind: "document-model", key: "test/other" },
        path: [],
        message:
          "A host serves test/other from its stored SDL, because the module's definition declares another document type or version.",
        repair: wire.repair,
        related: [
          {
            path: ["definition", "model", "documentType"],
            message: `PH-DM-DECLARATION-INVALID: ${wire.message}`,
          },
        ],
      },
    ]);
  });

  it("reports a validation that did not run, before its findings", async () => {
    expect(
      await release({
        completed: false,
        reason: "./scalars/index.ts could not be loaded: Error: boom",
        findings: [
          {
            kind: "scalar-unbound",
            documentType: "test/ledger",
            scalar: "Iban",
          },
        ],
      }),
    ).toEqual([
      {
        code: "PH-REL-HOST-VALIDATION-INCOMPLETE",
        severity: "error",
        phase: "import",
        path: [],
        message:
          "Host validation did not run, so this check cannot tell whether a host serves the package's models as declared.",
        received: "./scalars/index.ts could not be loaded: Error: boom",
        repair:
          "Fix what stopped host validation, then run the release check again.",
      },
      expect.objectContaining({ code: "PH-REL-HOST-SCALAR-UNBOUND" }),
    ]);
  });
});

describe("checkProjectDefinitions with the release profile", () => {
  const project = {
    sourceSet: sourceSet(V1, V2),
    artifacts,
    unregistered: [],
    diagnostics: [],
  };

  it.each<{
    outcome: string;
    host: HostValidationEvidence;
    status: string;
    code: string;
  }>([
    {
      outcome: "whose host validation did not run as failed",
      host: { completed: false, reason: "no scalars", findings: [] },
      status: "failed",
      code: "PH-REL-HOST-VALIDATION-INCOMPLETE",
    },
    {
      outcome: "with a host finding as invalid",
      host: found({
        kind: "scalar-unbound",
        documentType: "test/ledger",
        scalar: "Iban",
      }),
      status: "invalid",
      code: "PH-REL-HOST-SCALAR-UNBOUND",
    },
  ])("reports a release $outcome", async ({ host, status, code }) => {
    const report = await checkProjectDefinitions(
      { ...project, release: { host } },
      {
        checks: [...documentModelChecks, ...releaseChecks],
        profile: "release",
      },
    );
    expect({
      status: report.status,
      codes: report.diagnostics.map((diagnostic) => diagnostic.code),
    }).toEqual({ status, codes: [code] });
  });
});
