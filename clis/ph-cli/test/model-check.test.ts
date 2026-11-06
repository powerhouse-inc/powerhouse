import type {
  DefinitionCheckReport,
  DefinitionDiagnostic,
} from "@powerhousedao/shared/document-model";
import { DefinitionSourceLoader } from "document-model/tooling";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  check,
  codeFirstConfig,
  createModelProject,
  expectNoAbsolutePath,
  LEDGER,
  LEDGER_SOURCE,
  type Project,
  type Shape,
  storedModel,
  storedModule,
  storedOperation,
  WALLET,
} from "./model-project.js";

const made: Project[] = [];
afterEach(() => {
  made.splice(0).forEach((project) => project.dispose());
  vi.restoreAllMocks();
});

function project(
  shape: Shape,
  files: Readonly<Record<string, string>> = {},
): string {
  const created = createModelProject(shape, files);
  made.push(created);
  return created.root;
}

function parsed(stdout: string): DefinitionCheckReport {
  expect(stdout.endsWith("\n")).toBe(true);
  expect(stdout.trimEnd().split("\n")).toHaveLength(1);
  return JSON.parse(stdout) as DefinitionCheckReport;
}

const where = (diagnostic: DefinitionDiagnostic) => ({
  code: diagnostic.code,
  phase: diagnostic.phase,
  source: diagnostic.source,
  path: diagnostic.path,
});

const LEDGER_DEFINITION = {
  kind: "document-model",
  key: "example/ledger",
  version: 1,
  source: { specifier: LEDGER, exportPath: ["Ledger"] },
};
const WALLET_DEFINITION = {
  kind: "document-model",
  key: "example/wallet",
  version: 1,
  source: { specifier: WALLET },
};

describe("ph model check on a healthy project", () => {
  it.each([
    ["schema-first", "schema-first", [WALLET_DEFINITION]],
    ["code-first", "code-first", [LEDGER_DEFINITION]],
    ["mixed", "code-first", [LEDGER_DEFINITION, WALLET_DEFINITION]],
  ] as const)(
    "exits 0 for a %s project",
    async (shape, mode, definitions) => {
      const result = await check(project(shape), true);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      const report = parsed(result.stdout);
      expect(report).toMatchObject({
        kind: "powerhouse.definition-check",
        status: "ok",
        sourceSet: { mode, origin: "config" },
        diagnostics: [],
        summary: { errors: 0, warnings: 0 },
      });
      expect(
        report.definitions.map(({ digest, ...definition }) => {
          expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
          return definition;
        }),
      ).toEqual(definitions);
    },
    60_000,
  );

  it("counts a model that a selected source imports and exports", async () => {
    const result = await check(
      project("mixed", {
        "document-models/extra/index.ts": LEDGER_SOURCE.replaceAll(
          "ledger",
          "extra",
        ).replaceAll("Ledger", "Extra"),
        "document-models/ledger/index.ts": `export { Extra } from "../extra/index.js";\n${LEDGER_SOURCE}`,
      }),
      true,
    );
    expect(result.code).toBe(0);
    expect(parsed(result.stdout)).toMatchObject({
      status: "ok",
      definitions: [
        {
          key: "example/extra",
          source: { specifier: LEDGER, exportPath: ["Extra"] },
        },
        {
          key: "example/ledger",
          source: { specifier: LEDGER, exportPath: ["Ledger"] },
        },
        WALLET_DEFINITION,
      ],
      diagnostics: [],
    });
  }, 60_000);

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "fails on a source file under the models directory it cannot read",
    async () => {
      const root = project("mixed", {
        "document-models/extra/index.ts": LEDGER_SOURCE.replaceAll(
          "ledger",
          "extra",
        ).replaceAll("Ledger", "Extra"),
      });
      const locked = join(root, "document-models/extra/index.ts");
      chmodSync(locked, 0o000);
      try {
        const result = await check(root, true);
        const report = parsed(result.stdout);
        expect({
          code: result.code,
          status: report.status,
          diagnostics: report.diagnostics.map(
            ({ code, phase, source, path, message, expected, repair }) => ({
              code,
              phase,
              source,
              path,
              message,
              expected,
              repair,
            }),
          ),
        }).toEqual({
          code: 2,
          status: "failed",
          diagnostics: [
            {
              code: "PH-IMPORT-FAILED",
              phase: "import",
              source: { specifier: "./document-models/extra/index.ts" },
              path: [],
              message:
                "This path under the document models directory could not be read, so the scan cannot tell whether it declares a code-first model that no definitionSources entry reaches.",
              expected: "a readable file or directory",
              repair:
                "Fix the permissions of the path, or move it out of the document models directory.",
            },
          ],
        });
      } finally {
        chmodSync(locked, 0o644);
      }
    },
    60_000,
  );

  it("follows a definition source that imports through tsconfig paths", async () => {
    const result = await check(
      project("mixed", {
        "tsconfig.json": `{
  "compilerOptions": {
    // as ph init writes them
    "paths": {
      "document-models/*": ["./document-models/*/index.ts"],
    },
  },
}`,
        "definitions.ts": 'export { Ledger } from "document-models/ledger";\n',
        "powerhouse.config.json": codeFirstConfig("./definitions.ts"),
      }),
      true,
    );
    expect(result.code).toBe(0);
    expect(parsed(result.stdout)).toMatchObject({
      status: "ok",
      definitions: [
        {
          key: "example/ledger",
          source: { specifier: "./definitions.ts", exportPath: ["Ledger"] },
        },
        WALLET_DEFINITION,
      ],
      diagnostics: [],
    });
  }, 60_000);

  it("prints each definition with its source", async () => {
    const result = await check(project("mixed"), false);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      [
        "ok: 2 definitions (code-first, 1 selected source)",
        "  document-model example/ledger v1 ./document-models/ledger/index.ts#/Ledger",
        "  document-model example/wallet v1 ./document-models/wallet/wallet.json",
        "0 errors, 0 warnings",
        "",
      ].join("\n"),
    );
  }, 60_000);

  it("prints the same JSON twice and no machine path", async () => {
    const root = project("mixed");
    const first = await check(root, true);
    const second = await check(root, true);
    expect(second.stdout).toBe(first.stdout);
    expectNoAbsolutePath(first.stdout, root);
  }, 60_000);

  it("exits 0 and explains a skip when there is nothing to check", async () => {
    const root = project("empty");
    const json = await check(root, true);
    expect(json.code).toBe(0);
    expect(parsed(json.stdout)).toMatchObject({
      status: "skipped",
      skipReason: "definition-sources-absent",
      definitions: [],
    });
    expect((await check(root, false)).stdout).toBe(
      [
        "skipped: 0 definitions (schema-first, 0 selected sources)",
        "powerhouse.config.json declares no definitionSources and the package has no stored document model, so nothing was checked.",
        "0 errors, 0 warnings",
        "",
      ].join("\n"),
    );
  }, 60_000);
});

const ledgerWith = (from: string, to: string) => {
  expect(LEDGER_SOURCE).toContain(from);
  return { "document-models/ledger/index.ts": LEDGER_SOURCE.replace(from, to) };
};

const walletWith = (overrides: Parameters<typeof storedModel>[2]) => ({
  "document-models/wallet/wallet.json": storedModel(
    "example/wallet",
    "Wallet",
    overrides,
  ),
});

const titleOperation = storedOperation(
  "SET_TITLE",
  "input SetTitleInput {\n  title: String!\n}",
);

const BROKEN = [
  {
    name: "a type name that is not a GraphQL name",
    shape: "code-first",
    files: () =>
      ledgerWith('ph.object("LedgerState"', 'ph.object("Ledger State"'),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-DEF-NAME-INVALID",
      phase: "definition",
      source: { specifier: LEDGER },
      path: ["name"],
    },
    line: "PH-DEF-NAME-INVALID [error/definition] ./document-models/ledger/index.ts /name: A GraphQL name must match",
  },
  {
    name: "two stored operations with one action type",
    shape: "schema-first",
    files: () =>
      walletWith({
        modules: [
          storedModule("main", [titleOperation]),
          storedModule("extra", [
            { ...storedOperation("set_title", null), id: "again" },
          ]),
        ],
      }),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-DM-DUPLICATE-ACTION",
      phase: "definition",
      source: { specifier: WALLET },
      path: ["specifications", 0, "modules", 1, "operations", 0],
    },
    line: 'PH-DM-DUPLICATE-ACTION [error/definition] ./document-models/wallet/wallet.json document-model example/wallet@1 /specifications/0/modules/1/operations/0: operation "extra.setTitle" and operation "main.setTitle" share the action type SET_TITLE.',
  },
  {
    name: "two errors of a code-first operation with one code",
    shape: "code-first",
    files: () =>
      ledgerWith(
        'errors: { Overdrawn: { code: "OVERDRAWN" } }',
        'errors: { Overdrawn: { code: "LIMIT" }, Frozen: { code: "LIMIT" } }',
      ),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-DM-DUPLICATE-ERROR-CODE",
      phase: "definition",
      source: { specifier: LEDGER, exportPath: ["Ledger"] },
      path: ["specifications", 0, "modules", 0, "operations", 0, "errors", 1],
    },
    line: 'PH-DM-DUPLICATE-ERROR-CODE [error/definition] ./document-models/ledger/index.ts#/Ledger document-model example/ledger@1 /specifications/0/modules/0/operations/0/errors/1: error "Frozen" and error "Overdrawn" share the code LIMIT.',
  },
  {
    name: "a stored type that does not implement its interface",
    shape: "schema-first",
    files: () =>
      walletWith({
        globalSchema:
          "interface Named {\n  label: String!\n}\n\ntype WalletState implements Named {\n  title: String!\n}",
      }),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-DM-INTERFACE-INVALID",
      phase: "definition",
      source: { specifier: WALLET },
      path: ["specifications", 0, "state", "global", "schema"],
    },
    line: "PH-DM-INTERFACE-INVALID [error/definition] ./document-models/wallet/wallet.json document-model example/wallet@1 /specifications/0/state/global/schema: Interface field Named.label expected but WalletState does not provide it.",
  },
  {
    name: "a stored scalar declaration scalars/index.ts does not export",
    shape: "schema-first",
    files: () =>
      walletWith({
        globalSchema:
          "scalar MissingScalar\n\ntype WalletState {\n  title: String!\n}",
      }),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-DM-DECLARATION-INVALID",
      phase: "definition",
      source: { specifier: WALLET },
      path: ["specifications", 0, "state", "global", "schema"],
    },
    line: "PH-DM-DECLARATION-INVALID [error/definition] ./document-models/wallet/wallet.json document-model example/wallet@1 /specifications/0/state/global/schema: The stored schema declares scalar MissingScalar, which is not a GraphQL built-in",
  },
  {
    name: "a stored scalar only a type extension uses",
    shape: "schema-first",
    files: () =>
      walletWith({
        globalSchema:
          "type WalletState {\n  title: String!\n}\n\nextend type WalletState {\n  bic: MissingScalar\n}",
      }),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-DM-DECLARATION-INVALID",
      phase: "definition",
      source: { specifier: WALLET },
      path: ["specifications", 0, "state", "global", "schema"],
    },
    line: "PH-DM-DECLARATION-INVALID [error/definition] ./document-models/wallet/wallet.json document-model example/wallet@1 /specifications/0/state/global/schema: The stored schema uses scalar MissingScalar, which is not a GraphQL built-in",
  },
  {
    name: "a code-first module whose stored state schema was replaced",
    shape: "code-first",
    files: () =>
      ledgerWith(
        "export const Ledger = materialize(model.version({ modules: [entries] }));",
        'export const Ledger = materialize(model.version({ modules: [entries] }));\nLedger.documentModel.global.specifications[0].state.global.schema = "type LedgerState { forged: Int }";',
      ),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-DEF-COMPATIBILITY-INVALID",
      phase: "definition",
      source: { specifier: LEDGER, exportPath: ["Ledger"] },
      path: [
        "documentModel",
        "global",
        "specifications",
        0,
        "state",
        "global",
        "schema",
        "LedgerState",
      ],
    },
    line: "PH-DEF-COMPATIBILITY-INVALID [error/definition] ./document-models/ledger/index.ts#/Ledger document-model example/ledger@1 /documentModel/global/specifications/0/state/global/schema/LedgerState: The stored schema segment describes LedgerState differently than the definition.",
  },
  {
    name: "a code-first module whose stored history is not an array",
    shape: "code-first",
    files: () =>
      ledgerWith(
        "export const Ledger = materialize(model.version({ modules: [entries] }));",
        "export const Ledger = materialize(model.version({ modules: [entries] }));\n(Ledger.documentModel.global as { specifications: unknown }).specifications = null;",
      ),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-DM-DECLARATION-INVALID",
      phase: "definition",
      source: { specifier: LEDGER, exportPath: ["Ledger"] },
      path: ["documentModel", "global", "specifications"],
    },
    line: "PH-DM-DECLARATION-INVALID [error/definition] ./document-models/ledger/index.ts#/Ledger document-model example/ledger@1 /documentModel/global/specifications: The stored document model this source serves is malformed",
  },
  {
    name: "a documentModelsDir that names a file",
    shape: "schema-first",
    files: () => ({
      "powerhouse.config.json": '{ "documentModelsDir": "./package.json" }',
    }),
    exitCode: 2,
    status: "failed",
    found: {
      code: "PH-CONFIG-SOURCE-INVALID",
      phase: "configuration",
      source: undefined,
      path: ["documentModelsDir"],
    },
    line: "PH-CONFIG-SOURCE-INVALID [error/configuration] (no source) /documentModelsDir: documentModelsDir names a file, not a directory.",
  },
  {
    name: "a code-first model no definitionSources entry reaches",
    shape: "mixed",
    files: () => ({
      "document-models/extra/index.ts": LEDGER_SOURCE.replaceAll(
        "ledger",
        "extra",
      ).replaceAll("Ledger", "Extra"),
    }),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-PKG-DEFINITION-UNREGISTERED",
      phase: "package",
      source: { specifier: "./document-models/extra/index.ts" },
      path: [],
    },
    line: "PH-PKG-DEFINITION-UNREGISTERED [error/package] ./document-models/extra/index.ts (root): ./document-models/extra/ declares a code-first document model that no definitionSources entry reaches",
  },
  ...(["index.js", "index.mjs", "index.jsx"] as const).map((file) => ({
    name: `a code-first model in ${file} no definitionSources entry reaches`,
    shape: "mixed" as const,
    files: () => ({
      [`document-models/extra/${file}`]: LEDGER_SOURCE.replaceAll(
        "ledger",
        "extra",
      ).replaceAll("Ledger", "Extra"),
    }),
    exitCode: 1,
    status: "invalid" as const,
    found: {
      code: "PH-PKG-DEFINITION-UNREGISTERED" as const,
      phase: "package" as const,
      source: { specifier: `./document-models/extra/${file}` },
      path: [],
    },
    line: `PH-PKG-DEFINITION-UNREGISTERED [error/package] ./document-models/extra/${file} (root): ./document-models/extra/ declares a code-first document model that no definitionSources entry reaches`,
  })),
  {
    name: "a code-first model a selected source imports only for its side effects",
    shape: "mixed",
    files: () => ({
      "document-models/extra/index.ts": LEDGER_SOURCE.replaceAll(
        "ledger",
        "extra",
      ).replaceAll("Ledger", "Extra"),
      "document-models/ledger/index.ts": `import "../extra/index.js";\n${LEDGER_SOURCE}`,
    }),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-PKG-DEFINITION-UNREGISTERED",
      phase: "package",
      source: { specifier: "./document-models/extra/index.ts" },
      path: [],
    },
    line: "PH-PKG-DEFINITION-UNREGISTERED [error/package] ./document-models/extra/index.ts (root): ./document-models/extra/ declares a code-first document model that a selected source imports but does not export, so the package leaves it out. Expected: a definitionSources entry that exports the model ./document-models/extra/index.ts declares Received: imported, not exported",
  },
  {
    name: "a misspelled catalog scalar factory",
    shape: "code-first",
    files: () =>
      ledgerWith("currency: ph.Currency(),", "currency: ph.Curency(),"),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-SCALAR-UNKNOWN",
      phase: "definition",
      source: { specifier: LEDGER },
      path: ["Curency"],
    },
    line: "PH-SCALAR-UNKNOWN [error/definition] ./document-models/ledger/index.ts /Curency: ph.Curency names no catalog scalar.",
  },
  {
    name: "a scalar factory only the reactor host declares",
    shape: "code-first",
    files: () =>
      ledgerWith("currency: ph.Currency(),", "currency: ph.JSONObject(),"),
    exitCode: 1,
    status: "invalid",
    found: {
      code: "PH-SCALAR-INTERNAL",
      phase: "definition",
      source: { specifier: LEDGER },
      path: ["definition"],
    },
    line: "PH-SCALAR-INTERNAL [error/definition] ./document-models/ledger/index.ts scalar JSONObject /definition: JSONObject is internal to the reactor host. A document model cannot use it.",
  },
  {
    name: "a module that throws while it loads",
    shape: "code-first",
    files: () => ({
      "document-models/ledger/index.ts":
        "throw new Error(`ledger exploded in ${import.meta.url}`);\n",
    }),
    exitCode: 2,
    status: "failed",
    found: {
      code: "PH-IMPORT-FAILED",
      phase: "import",
      source: { specifier: LEDGER },
      path: [],
    },
    line: "PH-IMPORT-FAILED [error/import] ./document-models/ledger/index.ts (root): This definition source could not be imported. Expected: an importable TypeScript module Received: Error: ledger exploded in ./document-models/ledger/index.ts Repair:",
  },
  {
    name: "a config file that is not JSON",
    shape: "mixed",
    files: () => ({ "powerhouse.config.json": "{ not json" }),
    exitCode: 2,
    status: "failed",
    found: {
      code: "PH-CONFIG-SOURCE-INVALID",
      phase: "configuration",
      source: undefined,
      path: ["configFile"],
    },
    line: "PH-CONFIG-SOURCE-INVALID [error/configuration] (no source) /configFile: The selected Powerhouse config file could not be read",
  },
] as const;

describe("ph model check on a broken project", () => {
  it.each(BROKEN)(
    "exits $exitCode for $name",
    async ({ shape, files, exitCode, status, found, line }) => {
      const root = project(shape, files());
      const json = await check(root, true);
      expect(json.code).toBe(exitCode);
      expect(json.stderr).toBe("");
      const report = parsed(json.stdout);
      expect(report.status).toBe(status);
      expect(report.diagnostics.map(where)).toEqual([found]);
      expect(report.summary).toEqual({ errors: 1, warnings: 0 });
      expectNoAbsolutePath(json.stdout, root);

      const human = await check(root, false);
      expect(human.code).toBe(exitCode);
      const lines = human.stdout.trimEnd().split("\n");
      expect(lines[0]).toMatch(new RegExp(`^${status}: `));
      expect(lines.filter((text) => text.startsWith(found.code))).toEqual([
        expect.stringContaining(line),
      ]);
      expect(lines.at(-1)).toBe("1 error, 0 warnings");
    },
    60_000,
  );
});

describe("ph model check output streams", () => {
  it("sends what a module prints while it loads to stderr", async () => {
    const root = project(
      "code-first",
      ledgerWith(
        'import { defineDocumentModel, materialize, ph } from "document-model";',
        'import { defineDocumentModel, materialize, ph } from "document-model";\nprocess.stdout.write("noise from ledger\\n");',
      ),
    );
    const result = await check(root, true);
    expect(result.code).toBe(0);
    expect(parsed(result.stdout).status).toBe("ok");
    expect(result.stderr).toBe("noise from ledger\n");
  }, 60_000);

  it("exits 2 with only a message when it cannot run, and still disposes the loader", async () => {
    vi.spyOn(
      DefinitionSourceLoader.prototype,
      "normalizeDefinitionSources",
    ).mockRejectedValue(new Error("disk on fire"));
    const dispose = vi.spyOn(DefinitionSourceLoader.prototype, "dispose");
    const result = await check(project("mixed"), true);
    expect(result).toEqual({
      code: 2,
      stdout: "",
      stderr: "ph model check could not run: disk on fire\n",
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  }, 60_000);
});

describe("ph model check when the report cannot be printed", () => {
  afterEach(() => {
    vi.doUnmock("../src/services/model/render.js");
    vi.resetModules();
  });

  it("exits 2 with only a message, not the exit code of invalid models", async () => {
    vi.resetModules();
    vi.doMock("../src/services/model/render.js", () => ({
      renderCheckReport: () => {
        throw new Error("render broke");
      },
    }));
    const { runModelCheck } = await import("../src/services/model/check.js");
    let stdout = "";
    let stderr = "";
    const code = await runModelCheck(
      { json: false },
      {
        projectRoot: project("mixed"),
        streams: {
          out: (text) => void (stdout += text),
          err: (text) => void (stderr += text),
        },
      },
    );
    expect({ code, stdout, stderr }).toEqual({
      code: 2,
      stdout: "",
      stderr: "ph model check could not run: render broke\n",
    });
  }, 60_000);
});
