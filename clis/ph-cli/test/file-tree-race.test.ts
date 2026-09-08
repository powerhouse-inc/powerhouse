import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  type PathLike,
} from "node:fs";
import type * as NodeFsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const readdirRace = vi.hoisted(() => ({
  afterRead: undefined as undefined | ((directory: string) => void),
  beforeOpen: undefined as undefined | ((path: string) => void),
  afterOpen: undefined as undefined | ((path: string) => void),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFsPromises>();
  return {
    ...actual,
    readdir: async (path: PathLike, options: { withFileTypes: true }) => {
      const entries = await actual.readdir(path, options);
      const afterRead = readdirRace.afterRead;
      readdirRace.afterRead = undefined;
      afterRead?.(String(path));
      return entries;
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const path = String(args[0]);
      const beforeOpen = readdirRace.beforeOpen;
      const afterOpen = readdirRace.afterOpen;
      readdirRace.beforeOpen = undefined;
      readdirRace.afterOpen = undefined;
      beforeOpen?.(path);
      try {
        return await actual.open(...args);
      } finally {
        afterOpen?.(path);
      }
    },
  };
});

import {
  snapshotFileTree,
  writeFileIfAbsentOrEqual,
} from "../src/services/file-tree.js";
import { createDefinitionPackageRevision } from "../src/services/definition-check.js";

const created: string[] = [];

function temporaryDirectory(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  created.push(path);
  return path;
}

afterEach(() => {
  readdirRace.afterRead = undefined;
  readdirRace.beforeOpen = undefined;
  readdirRace.afterOpen = undefined;
  while (created.length > 0) {
    const path = created.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

function symlinkError(path: string): Error {
  return new Error(`Symbolic link: ${path}`);
}

describe("file-tree race protection", () => {
  it("does not hash a file changed to a symlink after enumeration", async () => {
    const root = temporaryDirectory("ph-file-tree-file-race-");
    const externalRoot = temporaryDirectory("ph-file-tree-external-file-");
    const path = join(root, "source.ts");
    const externalPath = join(externalRoot, "source.ts");
    writeFileSync(path, "export const local = true;\n");
    writeFileSync(externalPath, "export const external = true;\n");
    readdirRace.afterRead = (directory) => {
      expect(directory).toBe(root);
      rmSync(path);
      symlinkSync(externalPath, path, "file");
    };

    await expect(snapshotFileTree(root, symlinkError)).rejects.toThrow(
      /File tree changed|Symbolic link/,
    );
  });

  it("does not recurse into a directory changed to a symlink", async () => {
    const root = temporaryDirectory("ph-file-tree-directory-race-");
    const externalRoot = temporaryDirectory("ph-file-tree-external-directory-");
    const directory = join(root, "source");
    mkdirSync(directory);
    writeFileSync(join(directory, "local.ts"), "export {};\n");
    writeFileSync(join(externalRoot, "external.ts"), "export {};\n");
    readdirRace.afterRead = (readDirectory) => {
      expect(readDirectory).toBe(root);
      rmSync(directory, { recursive: true });
      symlinkSync(externalRoot, directory, "dir");
    };

    await expect(snapshotFileTree(root, symlinkError)).rejects.toThrow(
      /File tree changed|Symbolic link/,
    );
  });

  it("does not hash a package file changed to a symlink after enumeration", async () => {
    const root = temporaryDirectory("ph-definition-revision-race-");
    const externalRoot = temporaryDirectory("ph-definition-revision-external-");
    const sourceRoot = join(root, "src");
    const sourcePath = join(sourceRoot, "model.ts");
    const externalPath = join(externalRoot, "model.ts");
    const configFile = join(root, "powerhouse.config.json");
    mkdirSync(sourceRoot);
    writeFileSync(configFile, "{}\n");
    writeFileSync(sourcePath, "export const local = true;\n");
    writeFileSync(externalPath, "export const external = true;\n");
    const swapAfterSourceRead = (directory: string) => {
      if (directory !== sourceRoot) {
        readdirRace.afterRead = swapAfterSourceRead;
        return;
      }
      rmSync(sourcePath);
      symlinkSync(externalPath, sourcePath, "file");
    };
    readdirRace.afterRead = swapAfterSourceRead;

    await expect(
      createDefinitionPackageRevision({ configFile }),
    ).rejects.toThrow(/File tree changed|symbolic link/);
  });

  it("does not read through an ancestor swapped around the file open", async () => {
    const root = temporaryDirectory("ph-file-tree-ancestor-race-");
    const externalRoot = temporaryDirectory("ph-file-tree-ancestor-external-");
    const sourceRoot = join(root, "source");
    const parkedRoot = join(root, "source-parked");
    const sourcePath = join(sourceRoot, "model.ts");
    mkdirSync(sourceRoot);
    writeFileSync(sourcePath, "export const local = true;\n");
    writeFileSync(
      join(externalRoot, "model.ts"),
      "export const external = true;\n",
    );
    readdirRace.beforeOpen = (path) => {
      expect(path).toBe(sourcePath);
      renameSync(sourceRoot, parkedRoot);
      symlinkSync(externalRoot, sourceRoot, "dir");
    };
    readdirRace.afterOpen = () => {
      rmSync(sourceRoot);
      renameSync(parkedRoot, sourceRoot);
    };

    await expect(snapshotFileTree(root, symlinkError)).rejects.toThrow(
      /File tree changed|Symbolic link/,
    );
  });

  it("does not accept a write redirected by an ancestor swap", async () => {
    const root = temporaryDirectory("ph-file-write-ancestor-race-");
    const externalRoot = temporaryDirectory("ph-file-write-external-");
    const reportRoot = join(root, "reports");
    const parkedRoot = join(root, "reports-parked");
    const reportPath = join(reportRoot, "result.json");
    mkdirSync(reportRoot);
    readdirRace.beforeOpen = (path) => {
      expect(path.endsWith(join("reports", "result.json"))).toBe(true);
      renameSync(reportRoot, parkedRoot);
      symlinkSync(externalRoot, reportRoot, "dir");
    };
    readdirRace.afterOpen = () => {
      rmSync(reportRoot);
      renameSync(parkedRoot, reportRoot);
    };

    await expect(
      writeFileIfAbsentOrEqual(root, reportPath, "{}\n", symlinkError),
    ).rejects.toThrow(/File tree changed|Symbolic link/);
    expect(existsSync(reportPath)).toBe(false);
  });
});
