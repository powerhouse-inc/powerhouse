import type { DefinitionInspectionReport } from "document-model/tooling";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModelProject,
  expectNoAbsolutePath,
  inspect,
  LEDGER,
  type Project,
  type Shape,
  WALLET,
} from "./model-project.js";

const made: Project[] = [];
afterEach(() => made.splice(0).forEach((project) => project.dispose()));

function project(
  shape: Shape,
  files: Readonly<Record<string, string>> = {},
): string {
  const created = createModelProject(shape, files);
  made.push(created);
  return created.root;
}

function parsed(stdout: string): DefinitionInspectionReport {
  expect(stdout.trimEnd().split("\n")).toHaveLength(1);
  return JSON.parse(stdout) as DefinitionInspectionReport;
}

const withoutDigests = (text: string) =>
  text.replaceAll(/sha256:[0-9a-f]{64}/g, "sha256:<digest>");

const LEDGER_LINES = [
  "example/ledger Ledger (.ledger)",
  "  digest sha256:<digest>",
  "  compatibility identity derived-v1, scalar coercion catalog-v1, serialization canonical-v1",
  "  example/ledger@1",
  "    source ./document-models/ledger/index.ts#/Ledger",
  "    scopes global LedgerState, local none",
  "    scalars Currency (powerhouse.catalog#Currency), Iban (package#Iban)",
  "    module Entries",
  "      ADD_AMOUNT  global  input AddAmountInput  errors Overdrawn (OVERDRAWN)",
];

const WALLET_LINES = [
  "example/wallet Wallet (.wallet)",
  "  digest sha256:<digest>",
  "  compatibility identity explicit-schema-first, scalar coercion catalog-v1, serialization explicit-schema-first",
  "  example/wallet@1",
  "    source ./document-models/wallet/wallet.json",
  "    scopes global WalletState, local none",
  "    scalars Amount_Money (powerhouse.catalog#Amount_Money), Iban (package#Iban)",
  "    module funds",
  "      SET_BALANCE  global  input SetBalanceInput  errors WalletFrozen (WALLET_FROZEN)",
];

describe("ph model inspect", () => {
  it("describes every model of a mixed project", async () => {
    const result = await inspect(project("mixed"), false);
    expect(result.code).toBe(0);
    expect(withoutDigests(result.stdout)).toBe(
      [
        "ok: 2 models (code-first, 1 selected source)",
        ...LEDGER_LINES,
        ...WALLET_LINES,
        "0 errors, 0 warnings",
        "",
      ].join("\n"),
    );
  }, 60_000);

  it.each([
    ["schema-first", [`example/wallet@1 ${WALLET}`]],
    ["code-first", [`example/ledger@1 ${LEDGER}`]],
  ] as const)(
    "describes a %s project in one deterministic JSON report",
    async (shape, models) => {
      const root = project(shape);
      const first = await inspect(root, true);
      expect(first.code).toBe(0);
      expect(first.stderr).toBe("");
      const report = parsed(first.stdout);
      expect(report).toMatchObject({
        kind: "powerhouse.definition-inspection",
        status: "ok",
        sourceSet: { mode: shape },
        diagnostics: [],
      });
      expect(
        report.families.flatMap(({ documentType, versions }) =>
          versions.map(
            ({ version, source }) =>
              `${documentType}@${version} ${source.specifier}`,
          ),
        ),
      ).toEqual(models);
      expect(report).not.toHaveProperty("definition");
      expect((await inspect(root, true)).stdout).toBe(first.stdout);
      expectNoAbsolutePath(first.stdout, root);
    },
    60_000,
  );

  it("adds the full definition of the selected model", async () => {
    const root = project("mixed");
    const json = await inspect(root, true, "example/wallet@1");
    expect(json.code).toBe(0);
    const report = parsed(json.stdout);
    expect(report.families.map(({ documentType }) => documentType)).toEqual([
      "example/wallet",
    ]);
    expect(report.definition).toMatchObject({
      kind: "powerhouse.document-model",
      model: { documentType: "example/wallet", name: "Wallet" },
    });
    expectNoAbsolutePath(json.stdout, root);

    const human = await inspect(root, false, "example/wallet@1");
    expect(withoutDigests(human.stdout)).toBe(
      [
        "ok: 1 model (code-first, 1 selected source)",
        ...WALLET_LINES,
        "The full definition of this model is in --json, as `definition`.",
        "0 errors, 0 warnings",
        "",
      ].join("\n"),
    );
  }, 60_000);

  it.each(["example/nope@1", "@example/wallet@1"])(
    "exits 2 and lists the available models for %s",
    async (selector) => {
      const result = await inspect(project("mixed"), true, selector);
      expect(result.code).toBe(2);
      const report = parsed(result.stdout);
      expect(report.status).toBe("failed");
      expect(report.families).toEqual([]);
      expect(report.diagnostics).toMatchObject([
        {
          code: "PH-INSPECT-SELECTION-UNKNOWN",
          path: ["selection"],
          expected: "example/ledger@1, example/wallet@1",
          received: selector,
        },
      ]);
    },
    60_000,
  );

  it.each([
    "example/wallet",
    "example/wallet@",
    "example/wallet@0",
    "example/wallet@1.5",
    "example/wallet@01",
    "@1",
  ])("exits 2 with a usage message for the selector %j", async (selector) => {
    const result = await inspect(project("mixed"), true, selector);
    expect(result).toEqual({
      code: 2,
      stdout: "",
      stderr: `Expected <documentType>@<version> with a positive whole version, such as acme/invoice@1. Received ${JSON.stringify(selector)}.\n`,
    });
  });

  it("exits 2 when a module cannot be imported", async () => {
    const root = project("code-first", {
      "document-models/ledger/index.ts": 'throw new Error("boom");\n',
    });
    const result = await inspect(root, false);
    expect(result.code).toBe(2);
    expect(result.stdout.split("\n").slice(0, 2)).toEqual([
      "failed: 0 models (code-first, 1 selected source)",
      expect.stringMatching(
        /^PH-IMPORT-FAILED \[error\/import\] \.\/document-models\/ledger\/index\.ts \(root\): /,
      ),
    ]);
  }, 60_000);
});
