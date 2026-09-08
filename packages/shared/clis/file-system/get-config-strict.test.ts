import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfigStrict } from "./get-config-strict.js";
import type { ConfigFileError } from "./get-config-strict.js";

const created: string[] = [];

function temporaryPath(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "ph-config-strict-"));
  created.push(directory);
  return join(directory, name);
}

afterEach(() => {
  while (created.length > 0) {
    const directory = created.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("getConfigStrict", () => {
  it("merges a parsed object with the existing defaults", () => {
    const path = temporaryPath("powerhouse.config.json");
    writeFileSync(path, JSON.stringify({ logLevel: "debug" }));

    const config = getConfigStrict(path);

    expect(config.logLevel).toBe("debug");
    expect(config.documentModelsDir).toBe("./document-models");
  });

  it("does not hide a missing file", () => {
    const path = temporaryPath("missing.json");

    expect(() => getConfigStrict(path)).toThrowError(
      expect.objectContaining<Partial<ConfigFileError>>({
        reason: "not-found",
      }),
    );
  });

  it("does not hide invalid JSON", () => {
    const path = temporaryPath("powerhouse.config.json");
    writeFileSync(path, "{ invalid");

    expect(() => getConfigStrict(path)).toThrowError(
      expect.objectContaining<Partial<ConfigFileError>>({
        reason: "parse-failed",
      }),
    );
  });

  it("rejects a non-object JSON root", () => {
    const path = temporaryPath("powerhouse.config.json");
    writeFileSync(path, "[]");

    expect(() => getConfigStrict(path)).toThrowError(
      expect.objectContaining<Partial<ConfigFileError>>({
        reason: "root-invalid",
      }),
    );
  });
});
