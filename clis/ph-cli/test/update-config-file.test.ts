// Direct unit tests for `updateConfigFile`. Validates the fix that lets an
// explicit `--registry` flag override an existing `packageRegistryUrl` in
// `powerhouse.config.json` (without the explicit flag, an existing value is
// preserved — same behaviour as before).

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateConfigFile } from "../src/utils.js";

const CONFIG_FILE = "powerhouse.config.json";

function readConfig(projectPath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(projectPath, CONFIG_FILE), "utf-8"),
  ) as Record<string, unknown>;
}

describe("updateConfigFile — packageRegistryUrl handling", () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), "update-config-file-test-"));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  function seed(content: Record<string, unknown>): void {
    writeFileSync(
      join(projectPath, CONFIG_FILE),
      JSON.stringify(content, null, 2),
      "utf-8",
    );
  }

  it("writes packageRegistryUrl when none exists and the flag was not explicit", () => {
    seed({ packages: [] });
    updateConfigFile(
      [{ name: "@scope/pkg", version: "1.0.0" }],
      projectPath,
      "install",
      "registry",
      "https://from-call.example",
      // registryUrlExplicit defaults to false
    );
    expect(readConfig(projectPath).packageRegistryUrl).toBe(
      "https://from-call.example",
    );
  });

  it("does NOT overwrite an existing packageRegistryUrl when the flag was not explicit", () => {
    seed({
      packages: [],
      packageRegistryUrl: "https://already-set.example",
    });
    updateConfigFile(
      [{ name: "@scope/pkg", version: "1.0.0" }],
      projectPath,
      "install",
      "registry",
      "https://from-call.example",
    );
    expect(readConfig(projectPath).packageRegistryUrl).toBe(
      "https://already-set.example",
    );
  });

  it("DOES overwrite an existing packageRegistryUrl when the flag was explicit (the fix)", () => {
    seed({
      packages: [],
      packageRegistryUrl: "https://already-set.example",
    });
    updateConfigFile(
      [{ name: "@scope/pkg", version: "1.0.0" }],
      projectPath,
      "install",
      "registry",
      "https://from-flag.example",
      true, // registryUrlExplicit
    );
    expect(readConfig(projectPath).packageRegistryUrl).toBe(
      "https://from-flag.example",
    );
  });

  it("ignores an empty dependencies list — no packageRegistryUrl write", () => {
    seed({ packages: [] });
    updateConfigFile(
      [],
      projectPath,
      "install",
      "registry",
      "https://from-call.example",
      true,
    );
    expect(readConfig(projectPath).packageRegistryUrl).toBeUndefined();
  });

  it("uninstall task never writes packageRegistryUrl regardless of explicit flag", () => {
    seed({
      packages: [{ packageName: "@scope/pkg", version: "1.0.0" }],
      packageRegistryUrl: "https://already-set.example",
    });
    updateConfigFile(
      [{ name: "@scope/pkg", version: "1.0.0" }],
      projectPath,
      "uninstall",
      "registry",
      "https://from-flag.example",
      true,
    );
    // Unchanged because uninstall doesn't touch the field
    expect(readConfig(projectPath).packageRegistryUrl).toBe(
      "https://already-set.example",
    );
  });
});
