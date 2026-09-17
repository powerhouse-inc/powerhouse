import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { resolveWorkflowsEnabled } from "../../src/workflow/flag.js";

const dir = mkdtempSync(join(tmpdir(), "workflows-flag-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function configFile(name: string, config: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(config), "utf-8");
  return path;
}

const on = configFile("on.json", { workflows: { enabled: true } });
const off = configFile("off.json", { workflows: { enabled: false } });
const silent = configFile("silent.json", {});

describe("resolveWorkflowsEnabled", () => {
  it("is off when nothing says otherwise", () => {
    expect(resolveWorkflowsEnabled({ env: {} })).toBe(false);
  });

  it("reads workflows.enabled from the config file", () => {
    expect(resolveWorkflowsEnabled({ configFile: on, env: {} })).toBe(true);
    expect(resolveWorkflowsEnabled({ configFile: off, env: {} })).toBe(false);
    expect(resolveWorkflowsEnabled({ configFile: silent, env: {} })).toBe(
      false,
    );
  });

  it("lets the environment override the config file", () => {
    expect(
      resolveWorkflowsEnabled({
        configFile: off,
        env: { PH_WORKFLOWS_ENABLED: "true" },
      }),
    ).toBe(true);
    expect(
      resolveWorkflowsEnabled({
        configFile: on,
        env: { PH_WORKFLOWS_ENABLED: "0" },
      }),
    ).toBe(false);
  });

  it("accepts 1/true and 0/false, and ignores anything else", () => {
    for (const raw of ["1", "true", "TRUE", " true "]) {
      expect(
        resolveWorkflowsEnabled({ env: { PH_WORKFLOWS_ENABLED: raw } }),
      ).toBe(true);
    }
    for (const raw of ["0", "false", "FALSE"]) {
      expect(
        resolveWorkflowsEnabled({
          configFile: on,
          env: { PH_WORKFLOWS_ENABLED: raw },
        }),
      ).toBe(false);
    }
    expect(
      resolveWorkflowsEnabled({
        configFile: on,
        env: { PH_WORKFLOWS_ENABLED: "yes" },
      }),
    ).toBe(true);
  });

  it("lets the host override win over both", () => {
    expect(
      resolveWorkflowsEnabled({
        configFile: off,
        override: true,
        env: { PH_WORKFLOWS_ENABLED: "0" },
      }),
    ).toBe(true);
    expect(
      resolveWorkflowsEnabled({
        configFile: on,
        override: false,
        env: { PH_WORKFLOWS_ENABLED: "1" },
      }),
    ).toBe(false);
  });

  it("treats an unreadable config file as not configured", () => {
    expect(
      resolveWorkflowsEnabled({
        configFile: join(dir, "missing.json"),
        env: {},
      }),
    ).toBe(false);
  });

  it("needs no config file at all", () => {
    expect(
      resolveWorkflowsEnabled({ env: { PH_WORKFLOWS_ENABLED: "true" } }),
    ).toBe(true);
  });
});
