import nodeFs, { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncDirectory, syncTree } from "../../src/pglite/sync-tree.js";

describe("syncTree", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  /** root/{a, sub/{b, deeper/c}}: 3 files, 3 dirs. */
  async function tree(): Promise<string> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sync-tree-"));
    tempDirs.push(root);
    await fs.mkdir(path.join(root, "sub", "deeper"), { recursive: true });
    await fs.writeFile(path.join(root, "a"), "a");
    await fs.writeFile(path.join(root, "sub", "b"), "b");
    await fs.writeFile(path.join(root, "sub", "deeper", "c"), "c");
    return root;
  }

  it("fsyncs every file and directory once, root included", async () => {
    const root = await tree();
    const fds: number[] = [];
    const result = syncTree(root, {
      fsyncSync: (fd) => {
        nodeFs.fsyncSync(fd);
        fds.push(fd);
      },
    });
    expect(result).toEqual({ files: 3, dirs: 3 });
    // Whether a directory fd syncs at all depends on the platform.
    const dirSyncs = syncDirectory(root) ? 3 : 0;
    expect(fds).toHaveLength(3 + dirSyncs);
  });

  it("skips symlinks", async () => {
    const root = await tree();
    await fs.symlink(path.join(root, "a"), path.join(root, "link"));
    expect(syncTree(root)).toEqual({ files: 3, dirs: 3 });
  });

  it("propagates a failing file fsync", async () => {
    const root = await tree();
    const err = Object.assign(new Error("EIO"), { code: "EIO" });
    expect(() =>
      syncTree(root, {
        fsyncSync: () => {
          throw err;
        },
      }),
    ).toThrow(err);
  });

  it("tolerates a directory the platform will not sync", async () => {
    const root = await tree();
    const result = syncTree(root, {
      fsyncSync: (fd) => {
        if (nodeFs.fstatSync(fd).isDirectory()) throw new Error("EINVAL");
        nodeFs.fsyncSync(fd);
      },
    });
    expect(result).toEqual({ files: 3, dirs: 3 });
    expect(
      syncDirectory(root, {
        fsyncSync: () => {
          throw new Error("EINVAL");
        },
      }),
    ).toBe(false);
  });
});
