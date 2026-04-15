import { DEFAULT_REGISTRY_URL } from "@powerhousedao/shared/clis";
import { resolveRegistryUrl } from "@powerhousedao/shared/registry";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("resolveRegistryUrl", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `registry-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns explicit registry (highest priority)", () => {
    const result = resolveRegistryUrl({
      registry: "https://flag.io",
      projectPath: tempDir,
      env: { PH_REGISTRY_URL: "https://env.io" },
    });
    expect(result).toBe("https://flag.io");
  });

  it("returns env var when no flag", () => {
    const result = resolveRegistryUrl({
      projectPath: tempDir,
      env: { PH_REGISTRY_URL: "https://env.io" },
    });
    expect(result).toBe("https://env.io");
  });

  it("returns config when no flag or env", () => {
    writeFileSync(
      join(tempDir, "powerhouse.config.json"),
      JSON.stringify({ packageRegistryUrl: "https://config.io" }),
    );

    const result = resolveRegistryUrl({
      projectPath: tempDir,
      env: {},
    });
    expect(result).toBe("https://config.io");
  });

  it("returns DEFAULT_REGISTRY_URL when nothing is set", () => {
    const result = resolveRegistryUrl({
      projectPath: tempDir,
      env: {},
    });
    expect(result).toBe(DEFAULT_REGISTRY_URL);
  });

  it("env takes priority over config", () => {
    writeFileSync(
      join(tempDir, "powerhouse.config.json"),
      JSON.stringify({ packageRegistryUrl: "https://config.io" }),
    );

    const result = resolveRegistryUrl({
      projectPath: tempDir,
      env: { PH_REGISTRY_URL: "https://env.io" },
    });
    expect(result).toBe("https://env.io");
  });

  it("flag takes priority over env and config", () => {
    writeFileSync(
      join(tempDir, "powerhouse.config.json"),
      JSON.stringify({ packageRegistryUrl: "https://config.io" }),
    );

    const result = resolveRegistryUrl({
      registry: "https://flag.io",
      projectPath: tempDir,
      env: { PH_REGISTRY_URL: "https://env.io" },
    });
    expect(result).toBe("https://flag.io");
  });
});
