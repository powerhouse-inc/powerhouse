import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ConfigFileError, getConfigStrict } from "./get-config-strict.js";

describe("getConfigStrict", () => {
  const root = mkdtempSync(join(tmpdir(), "ph-strict-config-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  function write(name: string, text: string): string {
    const path = join(root, name);
    writeFileSync(path, text, "utf-8");
    return path;
  }

  it("passes definitionSources through untouched for the caller to narrow", () => {
    const path = write(
      "sources.json",
      JSON.stringify({
        definitionSources: { formatVersion: 9, mode: "whatever" },
      }),
    );
    expect(getConfigStrict(path).definitionSources).toEqual({
      formatVersion: 9,
      mode: "whatever",
    });
  });

  it("fails on a missing file instead of returning defaults", () => {
    expect(() => getConfigStrict(join(root, "absent.json"))).toThrow(
      ConfigFileError,
    );
    try {
      getConfigStrict(join(root, "absent.json"));
    } catch (error) {
      expect((error as ConfigFileError).reason).toBe("missing");
    }
  });

  it("fails on malformed JSON and on a non-object document", () => {
    const malformed = write("bad.json", "{");
    const list = write("list.json", "[]");
    expect(() => getConfigStrict(malformed)).toThrow(/parse-failed/);
    expect(() => getConfigStrict(list)).toThrow(/not-an-object/);
  });
});
