import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateCmds } from "../src/commands/generate.js";
import { startGenerateHosts } from "../src/services/generate-hosts.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("ph generate hosts", () => {
  it("is registered", () => {
    expect(Object.keys(generateCmds)).toContain("hosts");
  });

  it("is a no-op success without a hosts/ folder", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ph-gen-hosts-"));
    temporary.push(dir);
    writeFileSync(path.join(dir, "package.json"), "{}");
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await startGenerateHosts(dir)).toBe(true);
  });
});
