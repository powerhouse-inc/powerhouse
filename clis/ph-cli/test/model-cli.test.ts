import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import type { DefinitionInspectionReport } from "document-model/tooling";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createModelProject,
  LEDGER_SOURCE,
  type Project,
} from "./model-project.js";

const PH_CLI = join(import.meta.dirname, "..", "dist", "cli.mjs");

const made: Project[] = [];
afterEach(() => made.splice(0).forEach((project) => project.dispose()));

/** A mixed project whose code-first model logs while it loads. */
function noisyProject(files: Readonly<Record<string, string>> = {}): string {
  const project = createModelProject("mixed", {
    "document-models/ledger/index.ts": `console.log("noise from ledger");\n${LEDGER_SOURCE}`,
    ...files,
  });
  made.push(project);
  return project.root;
}

function phCli(root: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [PH_CLI, "model", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PH_NO_TELEMETRY: "1" },
    timeout: 45_000,
  });
  return {
    code: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("the built ph-cli model command", () => {
  it("prints one JSON report on stdout and the package's logs on stderr", () => {
    const result = phCli(noisyProject(), "check", "--json");
    expect(result.code).toBe(0);
    expect(result.stdout.endsWith("}\n")).toBe(true);
    expect(result.stdout.trimEnd().split("\n")).toHaveLength(1);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.status).toBe("ok");
    expect(report.definitions.map(({ key }) => key)).toEqual([
      "example/ledger",
      "example/wallet",
    ]);
    expect(result.stderr).toContain("noise from ledger\n");
  }, 60_000);

  it("keeps stdout one JSON report when a module prints after loading", () => {
    const result = phCli(
      noisyProject({
        "document-models/ledger/index.ts": `process.on("exit", () => console.log("late noise from ledger"));\n${LEDGER_SOURCE}`,
      }),
      "check",
      "--json",
    );
    expect(result.code).toBe(0);
    expect((JSON.parse(result.stdout) as DefinitionCheckReport).status).toBe(
      "ok",
    );
    expect(result.stderr).toContain("late noise from ledger\n");
  }, 60_000);

  it.each(["check", "inspect"])(
    "%s exits after the report when a module leaves a timer running",
    (command) => {
      const result = phCli(
        noisyProject({
          "document-models/ledger/index.ts": `setInterval(() => {}, 1_000);\n${LEDGER_SOURCE}`,
        }),
        command,
        "--json",
      );
      expect(result.signal).toBe(null);
      expect(result.code).toBe(0);
      expect((JSON.parse(result.stdout) as { status: string }).status).toBe(
        "ok",
      );
    },
    60_000,
  );

  it("exits 1 for an invalid project", () => {
    const result = phCli(
      noisyProject({
        "document-models/extra/index.ts": LEDGER_SOURCE.replaceAll(
          "ledger",
          "extra",
        ).replaceAll("Ledger", "Extra"),
      }),
      "check",
    );
    expect(result.code).toBe(1);
    expect(result.stdout).toContain(
      "PH-PKG-DEFINITION-UNREGISTERED [error/package] ./document-models/extra/index.ts (root):",
    );
  }, 60_000);

  it("inspects one selected model", () => {
    const result = phCli(
      noisyProject(),
      "inspect",
      "example/ledger@1",
      "--json",
    );
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as DefinitionInspectionReport;
    expect(report.families.map(({ documentType }) => documentType)).toEqual([
      "example/ledger",
    ]);
    expect(report.definition?.model.documentType).toBe("example/ledger");
  }, 60_000);

  it.each([
    [["check", "--jsn"], "Unknown arguments"],
    [["inspect", "example/ledger"], "Expected <documentType>@<version>"],
  ])(
    "exits 2 for the arguments %j",
    (args, message) => {
      const result = phCli(noisyProject(), ...args);
      expect(result.code).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(message);
    },
    60_000,
  );
});
