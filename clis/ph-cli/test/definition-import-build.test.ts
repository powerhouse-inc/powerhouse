import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeBuildTypeScriptSourceImportAdapter } from "../src/services/definition-import-build.js";

const revision = `sha256:${"a".repeat(64)}` as `sha256:${string}`;

afterEach(() => vi.restoreAllMocks());

describe("NodeBuildTypeScriptSourceImportAdapter", () => {
  it("imports one temporary node bundle per source revision and cleans it", async () => {
    const packageRoot = mkdtempSync(join(tmpdir(), "ph-definition-package-"));
    let emittedPath = "";
    const build = vi.fn((config: { outDir?: string }) => {
      const outDir = config.outDir;
      if (!outDir) throw new Error("Expected an output directory");
      emittedPath = `${outDir}/definition.mjs`;
      writeFileSync(emittedPath, "export const selected = 42;\n");
      return Promise.resolve([
        {
          chunks: [
            {
              type: "chunk",
              isEntry: true,
              outDir,
              fileName: "definition.mjs",
            },
          ],
        },
      ]);
    });
    const adapter = new NodeBuildTypeScriptSourceImportAdapter(build as never);
    const request = {
      packageRoot,
      specifier: "./src/model.ts" as const,
      packageRevision: revision,
    };

    try {
      const first = await adapter.importModule(request);
      const second = await adapter.importModule(request);

      expect(first.selected).toBe(42);
      expect(second).toBe(first);
      expect(build).toHaveBeenCalledTimes(1);
      const config = build.mock.calls[0]?.[0] as {
        deps?: { neverBundle?: readonly RegExp[] };
      };
      expect(config.deps?.neverBundle?.[0]?.test("document-model")).toBe(true);
      expect(config.deps?.neverBundle?.[0]?.test("./relative-source.js")).toBe(
        false,
      );
      expect(emittedPath).toContain(`${packageRoot}/.ph/definition-build-`);
      expect(existsSync(emittedPath)).toBe(true);
      await adapter.close();
      expect(existsSync(emittedPath)).toBe(false);
    } finally {
      await adapter.close();
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  it("rejects a symlinked temporary-build directory", async () => {
    const packageRoot = mkdtempSync(join(tmpdir(), "ph-definition-package-"));
    const externalRoot = mkdtempSync(join(tmpdir(), "ph-definition-external-"));
    symlinkSync(externalRoot, join(packageRoot, ".ph"), "dir");
    const build = vi.fn();
    const adapter = new NodeBuildTypeScriptSourceImportAdapter(build as never);

    try {
      await expect(
        adapter.importModule({
          packageRoot,
          specifier: "./src/model.ts",
          packageRevision: revision,
        }),
      ).rejects.toThrow(/temporary definition build path.*symbolic link/i);
      expect(build).not.toHaveBeenCalled();
      expect(readdirSync(externalRoot)).toEqual([]);
    } finally {
      await adapter.close();
      rmSync(packageRoot, { recursive: true, force: true });
      rmSync(externalRoot, { recursive: true, force: true });
    }
  });

  it("does not share an aborted caller's import promise", async () => {
    const packageRoot = mkdtempSync(join(tmpdir(), "ph-definition-package-"));
    const releases: Array<() => void> = [];
    const build = vi.fn((config: { outDir?: string }) => {
      const outDir = config.outDir;
      if (!outDir) throw new Error("Expected an output directory");
      writeFileSync(
        `${outDir}/definition.mjs`,
        "export const selected = 42;\n",
      );
      return new Promise((resolveBuild) => {
        releases.push(() =>
          resolveBuild([
            {
              chunks: [
                {
                  type: "chunk",
                  isEntry: true,
                  outDir,
                  fileName: "definition.mjs",
                },
              ],
            },
          ]),
        );
      });
    });
    const adapter = new NodeBuildTypeScriptSourceImportAdapter(build as never);
    const controller = new AbortController();
    const request = {
      packageRoot,
      specifier: "./src/model.ts" as const,
      packageRevision: revision,
    };

    try {
      const canceled = adapter.importModule({
        ...request,
        signal: controller.signal,
      });
      const active = adapter.importModule(request);
      await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(2));
      controller.abort();
      for (const release of releases) release();

      await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
      await expect(active).resolves.toMatchObject({ selected: 42 });
    } finally {
      await adapter.close();
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });
});
