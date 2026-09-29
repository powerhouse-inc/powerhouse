import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { packageJsonTemplate } from "templates";
import { detectFeatures } from "../../codegen/features.js";
import { writeModuleFiles } from "./generated-project-files.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The export is part of every package's map; the list arrives with the first
// generated piece, which is also when the pieces framework is installed.
describe("a new project's pieces entry", () => {
  it("exports ./pieces without writing a pieces list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ph-init-pieces-"));
    temporary.push(dir);

    await writeModuleFiles(dir);

    const exports = (
      JSON.parse(packageJsonTemplate("test-project", {}, {})) as {
        exports: Record<string, unknown>;
      }
    ).exports;
    expect(exports["./pieces"]).toEqual(packageJsonExports["./pieces"]);
    expect(existsSync(join(dir, "subgraphs", "index.ts"))).toBe(true);
    expect(existsSync(join(dir, "pieces"))).toBe(false);
    expect(detectFeatures(dir)).not.toContain("piece");
  });
});
