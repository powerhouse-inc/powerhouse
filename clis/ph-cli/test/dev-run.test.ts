import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readDevRun } from "../src/services/dev-run.js";
import {
  writeVetraRuntime,
  type VetraRuntimeRecord,
} from "../src/utils/vetra-runtime.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "ph-dev-run-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "p" }));
  return root;
}

const record = (pid: number): VetraRuntimeRecord => ({
  pid,
  projectName: "p",
  switchboardPort: 4001,
  connectPort: 3000,
  switchboardUrl: "http://localhost:4001/graphql",
  mcpUrl: "http://localhost:4001/mcp",
  connectUrl: "http://localhost:3000/",
  startedAt: "2026-01-02T03:04:05.000Z",
});

describe("what a dev server knows of its run", () => {
  it("names the services of the run this process started", () => {
    const root = project();
    writeVetraRuntime(root, record(process.pid));
    expect(readDevRun(root)).toEqual({
      tool: { name: "ph-cli", version: expect.any(String) as string },
      startedAt: "2026-01-02T03:04:05.000Z",
      services: {
        connect: "http://localhost:3000/",
        switchboard: "http://localhost:4001/graphql",
        mcp: "http://localhost:4001/mcp",
      },
    });
  });

  it("leaves out the services of another process's run in the project", () => {
    const root = project();
    writeVetraRuntime(root, record(process.pid + 1));
    expect(readDevRun(root)).toMatchObject({ startedAt: null, services: {} });
  });

  it("knows the tool alone where no run is recorded", () => {
    expect(readDevRun(project())).toMatchObject({
      tool: { name: "ph-cli" },
      startedAt: null,
      services: {},
    });
  });
});
