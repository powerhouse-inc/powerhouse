import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workerPackageFileName } from "@powerhousedao/shared/connect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  prebuildWorkerPackages,
  WORKER_PACKAGES_MANIFEST,
  type WorkerPackageManifestEntry,
} from "./worker-packages-build.js";

function writeStaleOutput(outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, WORKER_PACKAGES_MANIFEST), "[]");
  writeFileSync(join(outDir, "stale.js"), "export const stale = 1;\n");
}

function writeProject(dir: string, modelsCode: string): void {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture-pkg", version: "1.2.3" }),
  );
  const modelsDir = join(dir, "dist/browser/document-models");
  mkdirSync(modelsDir, { recursive: true });
  writeFileSync(join(modelsDir, "index.js"), modelsCode);
}

describe("prebuildWorkerPackages", () => {
  let projectDir: string;
  let outDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "ph-worker-packages-test-"));
    outDir = join(projectDir, "dist/__reactor_worker__/packages");
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("removes a previous build's bundles when no package ships models", async () => {
    writeStaleOutput(outDir);
    const built = await prebuildWorkerPackages({
      dirname: projectDir,
      packages: ["@x/not-installed"],
      outDir,
    });
    expect(built).toEqual([]);
    expect(existsSync(outDir)).toBe(false);
  });

  it(
    "removes a previous build's bundles when the build fails",
    { timeout: 120_000 },
    async () => {
      writeProject(
        projectDir,
        `import "definitely-not-installed-xyz";\nexport const reducer = 1;\n`,
      );
      writeStaleOutput(outDir);
      const errorRef: { message?: string } = {};
      const built = await prebuildWorkerPackages({
        dirname: projectDir,
        packages: ["fixture-pkg"],
        outDir,
        errorRef,
      });
      expect(built).toBeNull();
      expect(errorRef.message).toBeTruthy();
      expect(existsSync(outDir)).toBe(false);
    },
  );

  it(
    "writes a manifest naming each built package",
    { timeout: 120_000 },
    async () => {
      writeProject(projectDir, `export const reducer = () => "fixture";\n`);
      writeStaleOutput(outDir);
      const errorRef: { message?: string } = {};
      const built = await prebuildWorkerPackages({
        dirname: projectDir,
        packages: ["fixture-pkg"],
        outDir,
        errorRef,
      });
      expect(errorRef.message).toBeUndefined();
      const expected: WorkerPackageManifestEntry[] = [
        {
          name: "fixture-pkg",
          version: "1.2.3",
          file: workerPackageFileName("fixture-pkg"),
        },
      ];
      expect(built).toEqual(expected);
      expect(
        JSON.parse(
          readFileSync(join(outDir, WORKER_PACKAGES_MANIFEST), "utf8"),
        ),
      ).toEqual(expected);
      expect(existsSync(join(outDir, expected[0].file))).toBe(true);
      expect(existsSync(join(outDir, "stale.js"))).toBe(false);
    },
  );
});
