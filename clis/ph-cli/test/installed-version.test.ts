import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { outdatedDependency } from "../src/services/installed-version.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ph-installed-"));
  vi.stubEnv("WORKSPACE_VERSION", "6.2.3-dev.102");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function install(dir: string, version: string) {
  const path = join(dir, "node_modules", "document-model");
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "package.json"), JSON.stringify({ version }));
}

describe("outdatedDependency", () => {
  it("names the upgrade when the project's package is older than ph-cli", () => {
    install(root, "6.2.3-dev.33");
    expect(outdatedDependency(root, "document-model")).toBe(
      "This project has document-model 6.2.3-dev.33, and what this ph migrate converts to code-first needs 6.2.3-dev.102 or later. Run ph migrate 6.2.3-dev.102 to upgrade the Powerhouse packages, then convert again.",
    );
  });

  it("accepts the same or a later version, found as Node resolves it", () => {
    install(root, "6.2.3-dev.102");
    const nested = join(root, "packages", "app");
    mkdirSync(nested, { recursive: true });
    expect(outdatedDependency(nested, "document-model")).toBeUndefined();
    install(nested, "6.3.0");
    expect(outdatedDependency(nested, "document-model")).toBeUndefined();
  });

  it("asks for an install when the package is missing", () => {
    expect(outdatedDependency(root, "document-model")).toContain(
      "document-model is not installed in this project.",
    );
  });

  it("checks nothing when ph-cli's own version is unknown", () => {
    vi.stubEnv("WORKSPACE_VERSION", "");
    vi.stubEnv("npm_package_version", "");
    install(root, "1.0.0");
    expect(outdatedDependency(root, "document-model")).toBeUndefined();
  });
});
