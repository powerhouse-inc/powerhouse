import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const roots: string[] = [];

function project(): string {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-argv-")));
  roots.push(root);
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "@acme/things", type: "module" })}\n`,
  );
  writeFileSync(join(root, "powerhouse.config.json"), "{}\n");
  writeFileSync(join(root, "tsconfig.json"), "{}\n");
  return root;
}

function ph(cwd: string, ...args: string[]) {
  const run = spawnSync(
    process.execPath,
    [
      join(REPOSITORY_ROOT, "node_modules", "tsx", "dist", "cli.mjs"),
      join(REPOSITORY_ROOT, "clis", "ph-cli", "src", "cli.ts"),
      ...args,
    ],
    { cwd, encoding: "utf-8", env: { ...process.env, PH_NO_TELEMETRY: "1" } },
  );
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("a flag that shares its name with another command's option", () => {
  it("model check --json leaves the next argument to its own option", () => {
    const run = ph(project(), "model", "check", "--json", "--source", "./x.ts");
    const report = JSON.parse(run.stdout) as {
      kind: string;
      sourceSet: { sources: unknown[] };
    };
    expect(report.kind).toBe("powerhouse.definition-check");
    expect(report.sourceSet.sources).toEqual([{ specifier: "./x.ts" }]);
    expect(run.status).toBe(2);
  }, 60_000);

  it("model check --json --json-lines is a usage error", () => {
    const run = ph(project(), "model", "check", "--json", "--json-lines");
    expect(run.stderr).toBe(
      "--json and --json-lines are two output shapes; choose one.\n",
    );
    expect(run.stdout).toBe("");
    expect(run.status).toBe(2);
  }, 60_000);

  it("model check --watch --json is a usage error", () => {
    const run = ph(project(), "model", "check", "--watch", "--json");
    expect(run.stderr).toBe(
      "--json prints one report and exits; use --watch --json-lines for machine output that follows edits.\n",
    );
    expect(run.stdout).toBe("");
    expect(run.status).toBe(2);
  }, 60_000);

  it("generate subgraph --code-first leaves --name its value", () => {
    const run = ph(
      project(),
      "generate",
      "subgraph",
      "--code-first",
      "--name",
      "widgets",
    );
    expect(run.stdout).toContain("Wrote subgraphs/widgets.ts\n");
    expect(run.status).toBe(0);
  }, 60_000);

  it("connect config --json still takes a value", () => {
    const root = project();
    const run = ph(
      root,
      "connect",
      "config",
      "--json",
      '{"renown":{"url":"https://renown.example"}}',
    );
    expect(run.status).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, "powerhouse.config.json"), "utf-8")),
    ).toEqual({ connect: { renown: { url: "https://renown.example" } } });
  }, 60_000);
});
