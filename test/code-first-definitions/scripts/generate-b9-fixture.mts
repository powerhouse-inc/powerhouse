#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createByteManifest } from "../src/evidence/byte-manifest.js";
import { sha256 } from "../src/evidence/utils.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(
  packageRoot,
  "fixtures/reproductions/v1/failure-propagation",
);

type Status =
  | "ready"
  | "ok"
  | "invalid"
  | "failed"
  | "skipped"
  | "process-failed";

function expected(
  status: Status,
  overrides: Partial<{
    diagnosticCodes: string[];
    sourceOrigin: string | null;
    exitCode: number;
    hookOrder: string[];
    typecheckCompleted: boolean;
    definitionCheckCompleted: boolean;
    bundleWriteCount: number;
    tarballWriteCount: number;
    registryRequestCount: number;
    decoyImportCount: number;
    skipReason: string | null;
    contributesReleaseEvidence: boolean;
    outputUnchanged: boolean;
  }> = {},
) {
  return {
    status,
    diagnosticCodes: [],
    sourceOrigin: null,
    exitCode:
      status === "invalid"
        ? 1
        : status === "failed"
          ? 2
          : status === "process-failed"
            ? 1
            : 0,
    hookOrder: [],
    typecheckCompleted: false,
    definitionCheckCompleted: false,
    bundleWriteCount: 0,
    tarballWriteCount: 0,
    registryRequestCount: 0,
    decoyImportCount: 0,
    skipReason: null,
    contributesReleaseEvidence: false,
    outputUnchanged: true,
    ...overrides,
  };
}

const validSourceConfig = {
  definitionSources: {
    formatVersion: 1,
    mode: "code-first",
    entries: [
      {
        specifier: "./definition.ts",
        exportPath: ["CounterV1"],
      },
    ],
  },
};

const cases = [
  {
    caseId: "tsc-failure-stops-before-bundles",
    category: "typecheck",
    command: "ph build",
    config: null,
    cliSources: [],
    expected: expected("process-failed", {
      hookOrder: ["tsc:start", "tsc:failed"],
    }),
  },
  {
    caseId: "definition-sources-missing",
    category: "configuration",
    command: "ph model check --json",
    config: {},
    cliSources: [],
    expected: expected("failed", {
      diagnosticCodes: ["PH-CONFIG-SOURCES-MISSING"],
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "definition-sources-empty",
    category: "configuration",
    command: "ph model check --json",
    config: {
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [],
      },
    },
    cliSources: [],
    expected: expected("failed", {
      diagnosticCodes: ["PH-CONFIG-SOURCES-MISSING"],
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "definition-sources-version-unsupported",
    category: "configuration",
    command: "ph model check --json",
    config: {
      definitionSources: {
        formatVersion: 2,
        mode: "code-first",
        entries: [{ specifier: "./definition.ts" }],
      },
    },
    cliSources: [],
    expected: expected("failed", {
      diagnosticCodes: ["PH-CONFIG-VERSION-UNSUPPORTED"],
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "duplicate-canonical-source",
    category: "configuration",
    command: "ph model check --json",
    config: {
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [
          { specifier: "./definition.ts" },
          { specifier: "./src/../definition.ts", exportPath: [] },
        ],
      },
    },
    cliSources: [],
    expected: expected("failed", {
      diagnosticCodes: ["PH-CONFIG-DUPLICATE-SOURCE"],
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "source-root-escape",
    category: "configuration",
    command: "ph model check --json",
    config: {
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./../outside.ts" }],
      },
    },
    cliSources: [],
    expected: expected("failed", {
      diagnosticCodes: ["PH-CONFIG-SOURCE-OUTSIDE-PACKAGE"],
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "source-external-symlink",
    category: "configuration",
    command: "ph model check --json",
    config: {
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/external.ts" }],
      },
    },
    cliSources: [],
    expected: expected("failed", {
      diagnosticCodes: ["PH-CONFIG-SOURCE-OUTSIDE-PACKAGE"],
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "config-only-selection",
    category: "source-selection",
    command: "ph model check --json",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("ready", {
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "cli-replaces-missing-selection",
    category: "source-selection",
    command: "ph model check --source ./definition.ts#/CounterV1 --json",
    config: {},
    cliSources: ["./definition.ts#/CounterV1"],
    expected: expected("ready", {
      sourceOrigin: "cli",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "cli-replaces-unsupported-selection",
    category: "source-selection",
    command: "ph model check --source ./definition.ts --json",
    config: {
      definitionSources: {
        formatVersion: 99,
        mode: "code-first",
        entries: [],
      },
    },
    cliSources: ["./definition.ts"],
    expected: expected("ready", {
      sourceOrigin: "cli",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "explicit-legacy-mode",
    category: "source-selection",
    command: "ph model check --json",
    config: { definitionSources: { formatVersion: 1, mode: "legacy" } },
    cliSources: [],
    expected: expected("skipped", {
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve", "definition-check:skipped"],
      definitionCheckCompleted: true,
      skipReason: "explicit-legacy-mode",
    }),
  },
  {
    caseId: "decoy-source-tree-not-scanned",
    category: "source-selection",
    command: "ph model check --json",
    config: {},
    cliSources: [],
    expected: expected("failed", {
      diagnosticCodes: ["PH-CONFIG-SOURCES-MISSING"],
      sourceOrigin: "config",
      hookOrder: ["config:load", "source:resolve"],
    }),
  },
  {
    caseId: "valid-control-edit",
    category: "definition",
    command: "ph model check --json",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("ok", {
      sourceOrigin: "config",
      hookOrder: [
        "config:load",
        "source:resolve",
        "source:import",
        "definition-check:ok",
      ],
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "valid-control-release",
    category: "definition",
    command: "ph model check --release --json",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("ok", {
      sourceOrigin: "config",
      hookOrder: [
        "config:load",
        "source:resolve",
        "source:import",
        "definition-check:ok",
      ],
      definitionCheckCompleted: true,
      contributesReleaseEvidence: true,
    }),
  },
  {
    caseId: "source-import-failure",
    category: "import",
    command: "ph model check --source ./injections/import-failure.ts --json",
    config: validSourceConfig,
    cliSources: ["./injections/import-failure.ts"],
    expected: expected("failed", {
      diagnosticCodes: ["PH-IMPORT-FAILED"],
      sourceOrigin: "cli",
      hookOrder: ["config:load", "source:resolve", "source:import-failed"],
    }),
  },
  {
    caseId: "definition-finalization-failure",
    category: "definition",
    command:
      "ph model check --source ./injections/definition-invalid.ts --json",
    config: validSourceConfig,
    cliSources: ["./injections/definition-invalid.ts"],
    expected: expected("invalid", {
      diagnosticCodes: ["PH-DEF-FIELD-OPTION-UNSUPPORTED"],
      sourceOrigin: "cli",
      hookOrder: [
        "config:load",
        "source:resolve",
        "source:import",
        "definition-check:invalid",
      ],
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "definition-warning",
    category: "warning",
    command:
      "ph model check --source ./injections/definition-warning.ts --json",
    config: validSourceConfig,
    cliSources: ["./injections/definition-warning.ts"],
    expected: expected("ok", {
      diagnosticCodes: ["PH-DEF-FIXTURE-WARNING"],
      sourceOrigin: "cli",
      hookOrder: [
        "config:load",
        "source:resolve",
        "source:import",
        "definition-check:ok",
      ],
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "definition-warning-as-error",
    category: "warning",
    command:
      "ph model check --source ./injections/definition-warning.ts --warnings-as-errors --json",
    config: validSourceConfig,
    cliSources: ["./injections/definition-warning.ts"],
    expected: expected("invalid", {
      diagnosticCodes: ["PH-DEF-FIXTURE-WARNING"],
      sourceOrigin: "cli",
      hookOrder: [
        "config:load",
        "source:resolve",
        "source:import",
        "definition-check:invalid",
      ],
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "build-definition-invalid-stops-before-bundles",
    category: "build",
    command: "ph build --source ./injections/definition-invalid.ts",
    config: validSourceConfig,
    cliSources: ["./injections/definition-invalid.ts"],
    expected: expected("process-failed", {
      diagnosticCodes: ["PH-DEF-FIELD-OPTION-UNSUPPORTED"],
      sourceOrigin: "cli",
      hookOrder: ["tsc:start", "tsc:ok", "definition-check:invalid"],
      typecheckCompleted: true,
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "build-control",
    category: "build",
    command: "ph build",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("ok", {
      sourceOrigin: "config",
      hookOrder: [
        "tsc:start",
        "tsc:ok",
        "definition-check:ok",
        "browser:write",
        "node:write",
        "tailwind:write",
        "release-report:retain",
      ],
      typecheckCompleted: true,
      definitionCheckCompleted: true,
      bundleWriteCount: 5,
      contributesReleaseEvidence: true,
      outputUnchanged: false,
    }),
  },
  {
    caseId: "build-explicit-legacy",
    category: "build",
    command: "ph build",
    config: { definitionSources: { formatVersion: 1, mode: "legacy" } },
    cliSources: [],
    expected: expected("skipped", {
      sourceOrigin: "config",
      hookOrder: [
        "tsc:start",
        "tsc:ok",
        "definition-check:skipped",
        "browser:write",
        "node:write",
        "tailwind:write",
        "release-report:retain",
      ],
      typecheckCompleted: true,
      definitionCheckCompleted: true,
      bundleWriteCount: 5,
      skipReason: "explicit-legacy-mode",
      outputUnchanged: false,
    }),
  },
  {
    caseId: "npm-prepack-missing-report",
    category: "prepack",
    command: "npm pack --dry-run --json",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("process-failed", {
      diagnosticCodes: ["PH-PKG-RELEASE-REPORT-MISSING"],
      sourceOrigin: "config",
      hookOrder: ["prepack", "retained-report:missing"],
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "pnpm-prepack-missing-report",
    category: "prepack",
    command: "pnpm pack",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("process-failed", {
      diagnosticCodes: ["PH-PKG-RELEASE-REPORT-MISSING"],
      sourceOrigin: "config",
      hookOrder: ["prepack", "retained-report:missing"],
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "npm-prepack-retained",
    category: "prepack",
    command: "npm pack --dry-run --json",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("ok", {
      sourceOrigin: "config",
      hookOrder: ["prepack", "retained-report:ok"],
      definitionCheckCompleted: true,
      contributesReleaseEvidence: true,
    }),
  },
  {
    caseId: "pnpm-prepack-retained",
    category: "prepack",
    command: "pnpm pack",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("ok", {
      sourceOrigin: "config",
      hookOrder: ["prepack", "retained-report:ok", "tarball:write"],
      definitionCheckCompleted: true,
      tarballWriteCount: 1,
      contributesReleaseEvidence: true,
    }),
  },
  {
    caseId: "npm-publish-dry-run-retained",
    category: "publication",
    command: "npm publish --dry-run --json",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("ok", {
      sourceOrigin: "config",
      hookOrder: ["prepack", "retained-report:ok", "publish:dry-run"],
      definitionCheckCompleted: true,
      contributesReleaseEvidence: true,
    }),
  },
  {
    caseId: "ph-publish-missing-report",
    category: "publication",
    command: "ph publish",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("process-failed", {
      diagnosticCodes: ["PH-PKG-RELEASE-REPORT-MISSING"],
      sourceOrigin: "config",
      hookOrder: ["publish:preflight", "retained-report:missing"],
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "registry-suppressed-after-failure",
    category: "publication",
    command: "ph publish",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("process-failed", {
      diagnosticCodes: ["PH-PKG-RELEASE-REPORT-MISSING"],
      sourceOrigin: "config",
      hookOrder: ["publish:preflight", "retained-report:missing"],
      definitionCheckCompleted: true,
    }),
  },
  {
    caseId: "inspect-control-source-selection",
    category: "source-selection",
    command: "ph model inspect powerhouse/cf-build-control@1 --json",
    config: validSourceConfig,
    cliSources: [],
    expected: expected("ok", {
      sourceOrigin: "config",
      hookOrder: [
        "config:load",
        "source:resolve",
        "source:import",
        "definition-inspect:ok",
      ],
      definitionCheckCompleted: true,
    }),
  },
] as const;

const schema = await readFile(
  resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
);
const manifest = {
  kind: "powerhouse.gate-fixture-manifest",
  formatVersion: 1,
  gate: "B9",
  fixtureVersion: "failure-propagation-v1",
  requiredTools: {
    node: ">=24",
    typescript: "6.0.3",
    npm: "available",
    pnpm: "10.33.4",
    ph: "workspace",
  },
  schemaDigest: sha256(schema),
  directDependencies: [],
  cases,
};
const priorOutputManifest = {
  formatVersion: 1,
  files: await createByteManifest(resolve(fixtureRoot, "prior-output")),
};

await Promise.all([
  writeFile(
    resolve(fixtureRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(fixtureRoot, "prior-output-manifest.json"),
    `${JSON.stringify(priorOutputManifest, null, 2)}\n`,
    "utf8",
  ),
]);
process.stdout.write(`Generated ${cases.length} B9 failure injections.\n`);
